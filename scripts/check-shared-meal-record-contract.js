const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const indexes = JSON.parse(fs.readFileSync(path.join(root, 'cloudfunctions/sharedMealRecord/schema/indexes.json'), 'utf8'))
const schema = JSON.parse(fs.readFileSync(path.join(root, 'cloudfunctions/sharedMealRecord/schema/record.schema.json'), 'utf8'))

const expected = [
  ['_openid:asc', 'idempotencyKey:asc'],
  ['_openid:asc', 'targetDogId:asc', 'mealTime:desc', '_id:desc']
]
const actual = indexes.indexes.map((index) => index.fields.map((item) => `${item.field}:${item.order}`))
if (JSON.stringify(actual) !== JSON.stringify(expected) || indexes.indexes[0].unique !== true) {
  throw new Error('shared_meal_records 索引契约不正确')
}
const ingredientRef = schema.properties.dogMealItems.items.$ref
if (ingredientRef !== '../../../contracts/shared-meal/shared-meal-ingredient-v1.schema.json') {
  throw new Error('本餐记录未引用唯一食材机器契约')
}
console.log('Shared meal record contract checks passed.')
