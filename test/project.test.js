import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtempSync, mkdirSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'

import {defaultPipelineName} from '../src/project.js'

test('uses the Git repository directory name from a nested directory', async (context) => {
  const parent = mkdtempSync(join(tmpdir(), 'heroku-resources-'))
  const repository = join(parent, 'example-pipeline')
  const nested = join(repository, 'some', 'nested', 'directory')
  mkdirSync(nested, {recursive: true})
  execFileSync('git', ['init', '--quiet', repository])
  context.after(() => rmSync(parent, {force: true, recursive: true}))

  assert.equal(await defaultPipelineName(nested), 'example-pipeline')
})

test('requires --pipeline outside a Git repository', async (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'heroku-resources-not-git-'))
  context.after(() => rmSync(directory, {force: true, recursive: true}))

  await assert.rejects(
    defaultPipelineName(directory),
    /Unable to determine the current Git repository\. Pass --pipeline <name>\./,
  )
})
