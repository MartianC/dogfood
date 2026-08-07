const defaultRecipeImage = '/assets/recipes/dog-food-bowl.jpg'
const defaultDogAvatar = '/assets/dogs/dog-head-profile.svg'

function recipeImage(recipe) {
  return (recipe && recipe.imageUrl) || defaultRecipeImage
}

function dogAvatar(dog, index = 0) {
  if (dog && dog.avatarUrl) return dog.avatarUrl
  return defaultDogAvatar
}

module.exports = {
  defaultRecipeImage,
  defaultDogAvatar,
  recipeImage,
  dogAvatar
}
