const recipes = require('../data/recipes')
const recipeUtils = require('../utils/recipe')

function listRecipes() {
  return recipes
}

function findRecipeById(id) {
  return recipeUtils.findRecipeById(recipes, id)
}

module.exports = { listRecipes, findRecipeById }
