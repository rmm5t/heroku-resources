# heroku-resources

A Heroku CLI plugin that reports dyno resources and estimated monthly costs for every app in a pipeline stage.

## Installation

Install dependencies, build the manifest, and install the local package into the Heroku CLI:

```sh
npm install
npm run build
heroku plugins:install file:$HOME/work/oss/heroku-resources
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

The report includes each app's process type, dyno size and quantity, running count, RAM per dyno, CPU allocation, and estimated maximum monthly cost. Its summary includes total allocated RAM and estimated monthly cost for the selected stage.

Cost estimates use the monthly prices maintained by Heroku CLI's `ps:type` command. Eco dynos are identified as sharing the account-level $5 Eco plan. CPU and RAM values are allocations based on dyno size, not live utilization.

## Development

```sh
npm test
npm run lint
```

To remove the local installation:

```sh
heroku plugins:uninstall heroku-resources
```

## License

[MIT License](https://rmm5t.mit-license.org/)
