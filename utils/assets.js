const defaultRecipeImage = '/assets/recipes/dog-food-bowl.jpg'
const defaultDogAvatar = '/assets/dogs/dog-head-profile.svg'
const defaultUserAvatar = '/assets/profile/default-user-avatar.svg'
const onboardingHeroImage = '/assets/onboarding/dog-profile-hero.webp'

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
  defaultUserAvatar,
  onboardingHeroImage,
  recipeImage,
  dogAvatar
}
