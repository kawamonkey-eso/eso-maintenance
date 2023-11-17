const { createHash } = require('node:crypto')
const { writeFile } = require('node:fs/promises')

;(async () => {
    const regex = /<div class="DismissMessage AlertMessage">(.+?)<\/div>/gs
    const response = await fetch('https://forums.elderscrollsonline.com/en')
    const html = await response.text()
    let m

    while ((m = regex.exec(html)) !== null) {
        const lines = m[1].split('<br/>\n')

        if ((m = /Maintenance for the week of (\w+) (\d{1,2})/.exec(lines[0])) !== null) {
            const currentYear = (new Date()).getFullYear()
            const [, wcMonth, wcDay] = m
            const weekCommencing = (new Date(`${wcDay} ${wcMonth} ${currentYear}`)).getTime()

            let known

            try {
                known = require('./known.json')
            } catch {}

            if (!known || known.wc != weekCommencing) {
                known = {data: [], wc: weekCommencing}
            }

            let genericUrl
            for (let line of lines.slice(1)) {
                if ((m = /^<a href="(.+?)"/.exec(line)) !== null) {
                    genericUrl = m[1]
                }
            }

            for (let line of lines.slice(1)) {
                if ((m = /(?:(.+?)®?: )?(.+) for (.+) – (\w+) (\d{1,2}).+?(\d{1,2}:\d{2}) UTC.+?(\d{1,2}:\d{2}) UTC/.exec(line)) !== null) {
                    const [purpose, month, day, startTime, endTime] = m.slice(3)
                    let status = 'scheduled'
                    let regions = []
                    let system, url

                    if (m[1]) {
                        system = m[1]

                        for (const region of ['EU', 'NA']) {
                            if (m[2].includes(region)) {
                                regions.push(region)
                            }
                        }
                    } else {
                        system = m[2] // system is in region field
                    }

                    if ((m = /\[(.+)\] (.+)/.exec(system)) !== null) {
                        status = m[1].toLowerCase()
                        system = m[2]
                    } else if ((m = /(\w[\w/ ]+)/.exec(system)) !== null) {
                        system = m[1]
                    }

                    if ((m = /<a href="(.+?)"/.exec(line)) !== null) {
                        url = m[1]
                    } else if (genericUrl) {
                        url = genericUrl
                    }

                    const startDate = new Date(`${day} ${month} ${currentYear} ${startTime} UTC`)
                    const endDate = new Date(`${day} ${month} ${currentYear} ${endTime} UTC`)

                    const data = JSON.stringify({
                        endDate,
                        regions,
                        startDate,
                        status,
                        system,
                        url
                    })
                    const hash = createHash('md5').update(data).digest('hex')

                    if (system == 'ESO Store and Account System') {
                        system = 'Store & Account System'
                    } else if ((m = /([A-Z]+) megaserver/.exec(system)) !== null) {
                        regions = [m[1]]
                        system = 'All'
                    }

                    if (known.data.includes(hash)) {
                        continue
                    } else {
                        known.data.push(hash)
                    }

                    let title = system + ' '
                    if (regions.length) {
                        title += regions.join(' & ') + ' '
                    }
                    title += purpose + ' ' + status

                    const payload = {
                        embeds: [
                            {
                                title,
                                url,
                                description: `<t:${startDate.getTime() / 1000}:F> to <t:${endDate.getTime() / 1000}:t>`,
                                fields: [
                                    {
                                        name: 'Start',
                                        value: `<t:${startDate.getTime() / 1000}:R>`
                                    },
                                    {
                                        name: 'End',
                                        value: `<t:${endDate.getTime() / 1000}:R>`
                                    }
                                ]
                            }
                        ]
                    }

                    const request = new Request(
                        process.env.WEBHOOK_URL,
                        {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(payload)
                        }
                    )
                    await fetch(request)
                }
            }

            await writeFile('./known.json', JSON.stringify(known))
        }
    }
})()