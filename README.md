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

The report includes each app's process type, dyno size and quantity, running count, RAM per dyno, CPU allocation, and estimated maximum monthly cost. A separate add-on table shows each service's plan, state, and billed cost. The summaries include total allocated RAM and separate dyno and add-on monthly cost estimates for the selected stage.

Dyno cost estimates use the monthly prices maintained by Heroku CLI's `ps:type` command. Add-on estimates use each resource's billed price, with metered and contract costs identified as unknown. Eco dynos are identified as sharing the account-level $5 Eco plan. CPU and RAM values are allocations based on dyno size, not live utilization.

## Development

```sh
npm install
npm test
npm run lint
npm run build
heroku plugins:install file:$HOME/work/oss/heroku-resources
```

To remove the local installation:

```sh
heroku plugins:uninstall heroku-resources
```

## Publishing

Authenticate with npm before release:

```sh
npm login
npm whoami
```

Use `npm publish`

## License

[MIT License](https://rmm5t.mit-license.org/)
