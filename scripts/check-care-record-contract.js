const fs = require('node:fs')
const path = require('node:path')
const { sync } = require('./sync-care-record-contract')

const root = path.resolve(__dirname, '..')
const entitySchema = JSON.parse(fs.readFileSync(path.join(
  root,
  'contracts/care/care-record-v1.schema.json'
), 'utf8'))
const writeSchema = JSON.parse(fs.readFileSync(path.join(
  root,
  'contracts/care/care-record-write-v1.schema.json'
), 'utf8'))
const storageSchema = JSON.parse(fs.readFileSync(path.join(
  root,
  'cloudfunctions/careRecord/schema/record.schema.json'
), 'utf8'))
const indexes = JSON.parse(fs.readFileSync(path.join(
  root,
  'cloudfunctions/careRecord/schema/indexes.json'
), 'utf8'))
const access = JSON.parse(fs.readFileSync(path.join(
  root,
  'cloudfunctions/careRecord/schema/access.json'
), 'utf8'))

const expectedTypes = [
  'vaccine',
  'internal_deworming',
  'external_deworming',
  'other'
]

const expectedEntityKeys = [
  'schemaVersion',
  'id',
  'dogId',
  'type',
  'name',
  'occurredOn',
  'nextDate',
  'notes',
  'createdAt',
  'updatedAt'
]

const expectedStorageKeys = [
  '_openid',
  'schemaVersion',
  'dogId',
  'type',
  'name',
  'occurredOn',
  'nextDate',
  'notes',
  'createdAt',
  'updatedAt'
]

const expectedIndexes = [
  ['_openid:asc', 'dogId:asc', 'occurredOn:desc', '_id:desc'],
  ['_openid:asc', 'dogId:asc', 'type:asc', 'occurredOn:desc', '_id:desc'],
  ['_openid:asc', 'dogId:asc', 'nextDate:asc', '_id:asc']
]

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

assert(entitySchema.$id === 'careRecord/v1', '护理记录实体合同版本不正确')
assert(writeSchema.$id === 'careRecordWrite/v1', '护理记录写入合同版本不正确')
assert(storageSchema.$id === 'careRecordStorage/v1', '护理记录存储合同版本不正确')
assert(entitySchema.additionalProperties === false, '护理记录实体不得包含未声明字段')
assert(writeSchema.additionalProperties === false, '护理记录写入不得包含未声明字段')
assert(storageSchema.additionalProperties === false, '护理记录存储不得包含未声明字段')
assert(
  JSON.stringify(entitySchema.required) === JSON.stringify(expectedEntityKeys),
  '护理记录实体字段顺序或集合不正确'
)
assert(
  JSON.stringify(entitySchema.properties.type.enum) === JSON.stringify(expectedTypes),
  '护理记录必须固定四类类型'
)
assert(
  JSON.stringify(writeSchema.properties.type.enum) === JSON.stringify(expectedTypes),
  '护理记录写入必须固定四类类型'
)
assert(
  entitySchema.properties.nextDate.type.includes('null')
  && writeSchema.properties.nextDate.type.includes('null'),
  '下次护理日期必须允许未填写'
)
assert(entitySchema.properties.name.maxLength === 120, '护理名称长度上限不正确')
assert(entitySchema.properties.notes.maxLength === 2000, '护理备注长度上限不正确')
assert(
  entitySchema.properties.occurredOn.pattern === '^\\d{4}-\\d{2}-\\d{2}$',
  '护理发生日期必须是日期文本'
)
assert(
  entitySchema.properties.nextDate.pattern === '^\\d{4}-\\d{2}-\\d{2}$',
  '下次护理日期必须是日期文本'
)
assert(
  JSON.stringify(storageSchema.required) === JSON.stringify(expectedStorageKeys),
  '护理记录存储字段顺序或集合不正确'
)
assert(
  JSON.stringify(storageSchema.properties.type.enum) === JSON.stringify(expectedTypes),
  '护理记录存储类型集合不正确'
)
const actualIndexes = indexes.indexes.map((index) => (
  index.fields.map((item) => `${item.field}:${item.order}`)
))
assert(JSON.stringify(actualIndexes) === JSON.stringify(expectedIndexes), '护理记录查询索引契约不正确')
assert(indexes.collection === 'care_records', '护理记录索引集合不正确')
assert(
  access.collection === 'care_records'
  && access.aclTag === 'ADMINONLY'
  && access.clientRead === false
  && access.clientWrite === false,
  '护理记录必须只允许云函数访问'
)
assert(sync({ check: true }) === false, '护理云函数合同副本必须与根合同同步')

console.log('Care record contract checks passed.')

module.exports = { entitySchema, writeSchema }
