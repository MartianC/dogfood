const defaultRecipeImage = '/assets/recipes/dog-food-bowl.jpg'
const defaultDogAvatar = '/assets/dogs/default-dog.jpg'
const alternateDogAvatar = '/assets/dogs/default-dog-alt.jpg'

function recipeImage(recipe) {
  return (recipe && recipe.imageUrl) || defaultRecipeImage
}

function dogAvatar(dog, index = 0) {
  if (dog && dog.avatarUrl) return dog.avatarUrl
  return index % 2 === 1 ? alternateDogAvatar : defaultDogAvatar
}

module.exports = {
  defaultRecipeImage,
  defaultDogAvatar,
  alternateDogAvatar,
  recipeImage,
  dogAvatar
}
