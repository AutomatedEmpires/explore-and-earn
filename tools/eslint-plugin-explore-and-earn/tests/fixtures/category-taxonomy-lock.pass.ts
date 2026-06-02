export const validListing = {
  category: "seasonal",
  setting: "lodge"
};

export const validCategories = ["farm", "mix"];

export function setCategoryFilter(category: "remote" | "maritime") {
  return category;
}