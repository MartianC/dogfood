// 此文件由 scripts/sync-subpackage-services.js 自动生成，请修改 shared-src 后重新同步。
const PAGE_SIZE = 20
let releaseCache = null

async function readReleases(database, status) {
  const query = database.collection('data_releases').where({ status })
  const releases = []
  let offset = 0
  while (true) {
    const result = await query.skip(offset).limit(PAGE_SIZE).get()
    const items = Array.isArray(result.data) ? result.data : []
    releases.push(...items)
    if (items.length < PAGE_SIZE) return releases
    offset += items.length
  }
}

function latestRelease(releases) {
  return (releases || []).slice().sort((left, right) => (
    String(right.generated_at || '').localeCompare(String(left.generated_at || ''))
    || String(right.release_id || '').localeCompare(String(left.release_id || ''))
  ))[0] || null
}

async function loadRuntimeRelease(database) {
  if (releaseCache) return releaseCache
  const activeRelease = latestRelease(await readReleases(database, 'active'))
  releaseCache = activeRelease || latestRelease(await readReleases(database, 'staging'))
  if (!releaseCache) throw new Error('未找到可用的数据发布版本')
  return releaseCache
}

function clearCache() {
  releaseCache = null
}

module.exports = {
  loadRuntimeRelease,
  clearCache,
  latestRelease
}
