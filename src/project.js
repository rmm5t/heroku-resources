import {execFile} from 'node:child_process'
import {basename} from 'node:path'
import {promisify} from 'node:util'

const execFileAsync = promisify(execFile)

export async function defaultPipelineName(cwd = process.cwd()) {
  try {
    const {stdout} = await execFileAsync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf8',
    })
    const repositoryRoot = stdout.trim()
    if (repositoryRoot) return basename(repositoryRoot)
  } catch {
    // The actionable error below is the same for a missing Git binary and a non-repository directory.
  }

  throw new Error('Unable to determine the current Git repository. Pass --pipeline <name>.')
}
