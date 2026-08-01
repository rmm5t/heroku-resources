import {Command} from '@heroku-cli/command'
import {Args, Flags} from '@oclif/core'

import {fetchPipelineResources} from '../api.js'
import {formatReport} from '../format.js'
import {defaultPipelineName} from '../project.js'
import {buildReport} from '../report.js'

const STAGES = ['review', 'development', 'staging', 'production']

export default class Resources extends Command {
  static args = {
    stage: Args.string({
      default: 'production',
      description: 'pipeline stage to report',
      options: STAGES,
    }),
  }

  static description = 'show dyno resources and estimated costs for apps in a pipeline stage'

  static enableJsonFlag = true

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> staging',
    '<%= config.bin %> <%= command.id %> production --pipeline my-pipeline',
  ]

  static flags = {
    pipeline: Flags.string({
      char: 'p',
      description: 'pipeline name or ID; defaults to the current Git repository directory name',
    }),
  }

  async run() {
    const {args, flags} = await this.parse(Resources)
    const pipelineName = flags.pipeline ?? await defaultPipelineName()
    const {apps, dynoSizes, pipeline} = await fetchPipelineResources(this.heroku, pipelineName, args.stage)
    const report = buildReport(pipeline.name, args.stage, apps, dynoSizes)

    if (!this.jsonEnabled()) this.log(formatReport(report))
    return report
  }
}
