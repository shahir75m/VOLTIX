const Brand = require("../models/Brand");
const makeTaxonomyController = require("./taxonomyControllerFactory");

const b = makeTaxonomyController({
  Model: Brand,
  productField: "brand",
  label: "Brand",
  folder: "voltix/brands",
});

module.exports = {
  listBrands: b.list,
  listAllBrands: b.listAll,
  createBrand: b.create,
  updateBrand: b.update,
  deleteBrand: b.remove,
  restoreBrand: b.restore,
};
