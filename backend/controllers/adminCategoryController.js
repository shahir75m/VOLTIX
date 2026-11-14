const Category = require("../models/Category");
const makeTaxonomyController = require("./taxonomyControllerFactory");

const c = makeTaxonomyController({
  Model: Category,
  productField: "category",
  label: "Category",
  folder: "voltix/categories",
});

module.exports = {
  listCategories: c.list,
  listAllCategories: c.listAll,
  createCategory: c.create,
  updateCategory: c.update,
  deleteCategory: c.remove,
  restoreCategory: c.restore,
};
