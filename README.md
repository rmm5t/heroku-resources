# heroku-resources

A Heroku CLI plugin that reports dyno resources and estimated monthly costs for every app in a pipeline stage.

## Installation

Install the published plugin from npm:

```sh
heroku plugins:install heroku-resources
```

## Usage

```text
heroku resources [STAGE] [--pipeline PIPELINE] [--json]
```

The stage defaults to `production`. The pipeline defaults to the current Git repository directory name, even when the command runs from a nested directory.

```sh
heroku resources
heroku resources staging
heroku resources production --pipeline another-pipeline
heroku resources --json
```

Example output:

```text
Pipeline: example (production)

App                 Process  Dyno size    Dynos  Up  RAM/dyno        CPU    Cost
------------------  -------  -----------  -----  --  --------  ---------  ------
example-production  web      Standard-1X      2   2    512 MB  2x shared  $50/mo
example-production  worker   Standard-2X      1   1      1 GB  2x shared  $50/mo

Total: 1 app, 3 dynos, 3 up, 2 GB allocated RAM, $100/month estimated
Allocation is based on dyno size; live CPU and RAM utilization is not available from the Heroku Platform API.

Add-ons

App                 Service          Plan         State         Cost
------------------  ---------------  -----------  -----------  -----
example-production  Heroku Postgres  Essential 1  provisioned  $9/mo
example-production  Papertrail       Fixa         provisioned  $8/mo

Total: 2 add-ons, $17/month estimated
```

The report includes each app's process type, dyno size and quantity, running count, RAM per dyno, CPU allocation, and estimated maximum monthly cost. A separate add-on table shows each service's plan, state, and billed cost. The summaries include total allocated RAM and separate dyno and add-on monthly cost estimates for the selected stage.

Dyno specifications and available public prices come from the live Platform API, with Heroku CLI pricing as a fallback. Add-on estimates use each resource's billed price, with metered and contract costs identified as unknown. Eco dynos are identified as sharing the account-level $5 Eco plan. CPU and RAM values are allocations based on dyno size, not live utilization.

## Development

```sh
npm install
npm test
npm run lint
npm run check:dyno-costs
npm run build
heroku plugins:link .
```

The linked working copy takes precedence over an npm-installed version. Return to the published version with:

```sh
heroku plugins:unlink heroku-resources
heroku plugins:install heroku-resources
```

Dyno RAM, CPU, and available public pricing come from Heroku's live `/dyno-sizes` Platform API endpoint. Private, Shield, and Fir prices currently require a static fallback copied from Heroku CLI. `npm run check:dyno-costs` compares that fallback with Heroku CLI's current source and fails when it needs updating.

## Publishing

Authenticate with npm before release:

```sh
npm login
npm whoami
```

Use `npm publish`

## License

[MIT License](https://rmm5t.mit-license.org/)
