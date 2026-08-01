const V3_HEADER = 'application/vnd.heroku+json; version=3'
const PIPELINES_HEADER = `${V3_HEADER}.pipelines`
const SDK_HEADER = `${V3_HEADER}.sdk`
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function findPipeline(heroku, nameOrId) {
  if (UUID_PATTERN.test(nameOrId)) {
    const {body} = await heroku.request(`/pipelines/${nameOrId}`, {
      headers: {Accept: PIPELINES_HEADER},
      method: 'GET',
    })
    return body
  }

  const {body: pipelines} = await heroku.request(
    `/pipelines?eq[name]=${encodeURIComponent(nameOrId)}`,
    {headers: {Accept: PIPELINES_HEADER}, method: 'GET'},
  )

  if (pipelines.length === 0) throw new Error(`Pipeline not found: ${nameOrId}`)
  if (pipelines.length > 1) {
    const ids = pipelines.map((pipeline) => pipeline.id).join(', ')
    throw new Error(`Multiple pipelines are named ${nameOrId}. Pass --pipeline with one of these IDs: ${ids}`)
  }

  return pipelines[0]
}

async function fetchAppResources(heroku, appId) {
  const [appResponse, dynosResponse, formationResponse, addonsResponse] = await Promise.all([
    heroku.get(`/apps/${appId}`),
    heroku.get(`/apps/${appId}/dynos`),
    heroku.get(`/apps/${appId}/formation`),
    heroku.get(`/apps/${appId}/addons`, {
      headers: {
        Accept: SDK_HEADER,
        'Accept-Expansion': 'addon_service,plan',
      },
    }),
  ])

  return {
    addons: addonsResponse.body,
    app: appResponse.body,
    dynos: dynosResponse.body,
    formation: formationResponse.body,
  }
}

export async function fetchPipelineResources(
  heroku,
  pipelineNameOrId,
  stage,
) {
  const pipeline = await findPipeline(heroku, pipelineNameOrId)
  const {body: couplings} = await heroku.get(
    `/pipelines/${pipeline.id}/pipeline-couplings`,
    {headers: {Accept: SDK_HEADER}},
  )

  const [dynoSizesResponse, apps] = await Promise.all([
    heroku.get('/dyno-sizes'),
    Promise.all(
      couplings
        .filter((coupling) => coupling.stage === stage)
        .map((coupling) => fetchAppResources(heroku, coupling.app.id)),
    ),
  ])

  return {apps, dynoSizes: dynoSizesResponse.body, pipeline}
}
