# heroku-resources

A Heroku CLI plugin that reports dyno resources and estimated monthly costs for every app in a pipeline stage.

## Installation

Install the published plugin from npm:

```sh
heroku plugins:install heroku-resources
```

## Upgrading

Upgrade to the latest published version:

```sh
heroku plugins:install heroku-resources@latest
```

To update all installed Heroku plugins:

```sh
heroku plugins:update
```

Check the installed version:

```sh
heroku plugins
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

App                 Service          Plan         State        Conn limit     RAM  Disk Size   Cost
------------------  ---------------  -----------  -----------  ----------  ------  ---------  -----
example-production  Heroku Postgres  Essential 1  provisioned          20  shared      10 GB  $9/mo
example-production  Papertrail       Fixa         provisioned         n/a     n/a        n/a  $8/mo

Total: 2 add-ons, $17/month estimated

Grand total: $117/month estimated
```

The report includes each app's process type, dyno size and quantity, running count, RAM per dyno, CPU allocation, and estimated maximum monthly cost. A separate add-on table shows each service's plan, state, connection limit, RAM, disk size, and billed cost. The summaries include total allocated RAM, separate dyno and add-on monthly cost estimates, and a final grand total combining both costs for the selected stage.

Dyno specifications and available public prices come from the live Platform API, with Heroku CLI pricing as a fallback. Add-on estimates use each resource's billed price, with metered and contract costs identified as unknown. Eco dynos are identified as sharing the account-level $5 Eco plan. CPU and RAM values are allocations based on dyno size, not live utilization.

The grand total adds known monthly dyno and add-on costs. Shared Eco pricing appears once as `+ shared $5 Eco plan`, and any unknown, metered, contract, or non-monthly costs are identified with `+ unknown costs`. JSON output includes a `grandTotal` object with `estimatedMonthlyCostCents`, `includesEcoPlan`, and `unknownCost`; the numeric estimate excludes shared Eco and unknown costs.

Add-on connection and disk limits come from the same live service APIs used by `heroku pg:info` and `heroku redis:info`. `Disk Size` shows the database capacity for Heroku Postgres. `RAM` shows the published instance memory for the active Postgres plan, or the maximum data memory (`Maxmemory`) for Heroku Key-Value Store. Postgres RAM allocations are maintained from the [Heroku plan catalog](https://elements.heroku.com/addons/heroku-postgresql) for Standard, Premium, Private, and Shield plans; Essential plans show `shared`. These values describe capacity limits. During a pending plan change, active limits can differ from the billed plan shown. Other services and unavailable limits display `n/a`; a failed limit lookup does not prevent the rest of the report. JSON output includes `maxConnections` (a number), `ram`, and `diskSize` (strings such as `4 GB`, `shared`, or `64 GB`), or `null` when unavailable.

### Pending add-on plan changes

Postgres and Key-Value Store add-ons show `upgrade pending` in the State column when the provider reports `Upgrading Plan`. When the active plan differs from the Platform API plan without an explicit upgrade status, the state is `plan change pending`, which also covers downgrades. The Plan column shows the active-to-target transition when both plans are known and differ:

```text
Service          Plan                     State            Conn limit   RAM  Disk Size     Cost
---------------  -----------------------  ---------------  ----------  ----  ---------  -------
Heroku Postgres  Standard 0 → Standard 2  upgrade pending         200  4 GB      64 GB  $200/mo
```

Connection limits, RAM, and disk size describe the active allocation; cost reflects the billed price. Ordinary maintenance alone does not indicate a pending plan change. Once the active plan matches the target and the provider finishes reporting an upgrade, the transition disappears.

JSON output keeps the target/billed plan in `plan` and includes `activePlan`, the full `providerStatus`, and `planChangePending` (`true` when a change is detected, otherwise `false`). `state` contains the same pending-change label used in the table. Unavailable active plans and provider statuses are `null`.

## Development

```sh
npm install
npm test
npm run lint
npm run check:upstream
npm run build
heroku plugins:link .
```

The linked working copy takes precedence over an npm-installed version. Return to the published version with:

```sh
heroku plugins:unlink heroku-resources
heroku plugins:install heroku-resources
```

Dyno RAM, CPU, and available public pricing come from Heroku's live `/dyno-sizes` Platform API endpoint. Private, Shield, and Fir prices currently require a static fallback copied from Heroku CLI. `npm run check:dyno-costs` compares that fallback with Heroku CLI's current source and fails when it needs updating.

### Upstream data checks

```sh
npm run check:dyno-costs    # Compare fallback dyno prices with Heroku CLI
npm run check:addon-limits  # Compare Postgres RAM allocations with Heroku's catalog
npm run check:upstream      # Run both checks
```

The add-on check verifies the local Postgres RAM mapping for Standard, Premium, Private, Shield, and Essential plans. It checks Essential's displayed RAM classification (`shared`), since the catalog JSON uses a `0 Bytes` placeholder. Changed allocations, new unmapped plans, and plans missing from the catalog cause a failure. Missing or malformed catalog data also fails the check rather than silently skipping validation.

Add-on prices, connection limits, disk capacity, and Key-Value Store RAM come from live APIs. Their parsing and cost calculations are covered by regression tests, including Essential's compliance annotations. These upstream checks cover the locally maintained fallback data.

Upstream checks require internet access but no Heroku credentials. They run separately from `npm test`, in CI on pushes and pull requests, and every Monday at 08:23 UTC. The **Upstream data checks** workflow can also be run manually from GitHub Actions.

## Publishing

Authenticate with npm before release:

```sh
npm login
npm whoami
```

Use `npm publish`. The `prepublishOnly` hook runs `npm run check:upstream` before publishing, and `prepack` builds the CLI manifest. Resolve any upstream-check failures before releasing; update the local mappings or catalog parser as indicated by the error.

## License

[MIT License](https://rmm5t.mit-license.org/)
