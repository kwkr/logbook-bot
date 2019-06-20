# logbook-bot

Bot for filling my logbook in Projektron. Currently build with [Puppeteer](https://github.com/GoogleChrome/puppeteer) so [Chrome](https://www.google.com/intl/en/chrome) is requried.

to run it:
`npm i`
`npm run fill`

In order for it to run properly following env variables must be set:

PROJEKTRON_LINK - link to your Projektron login page
PROJEKTRON_USER - your Projektron username ( or email)
PROJEKTRON_PWD - your Projektron password

or you can pass from the command line it every time you run it.

You can find source data format in `export.json` file. The bot will use it to fill weekly view (only current week) with the projects and corresponding task with the data from file. Objects in `hours:[...]` corresponds to subsequent days of the week (0 for monday, 1 for tuesday etc.). Each of them contains information about how much time to fill (`time:"2:00"`) and how to comment it (`comment:"I was doing nothing"`).

For tracking your time while at work you can use my other tool:

[LogMinion](https://logminion.com)

It allows yout to seamlessly track your activities and then export it as json.
Perfect input for this kind of bot!

You can export your log data from there and use it as an input for this bot. It will be converted automatically if it has correct format. The format is `<Projekt>|<Aufgabe>`. Note the `|` (pipe) for separation. For example, for the logs to be converted, you have to have a task `Interne Tätigkeiten | Allgemeines` in [LogMinion](https://logminion.com). Logs under this task will be used to fill your `Interne Tätigkeiten` "Projekt" for "Aufgabe" `Allgemeines`.

Then just swap `export.json` files in the project root. Currenlty only logs for current week will be filled.
