import { test } from "node:test";
import assert from "node:assert/strict";
import { buildVariantChoices } from "../src/utils/productVariants.js";
const v = (id, colour, ram, storage, inStock = true) => ({ _id:id, inStock, price:100, maxQuantity:inStock ? 2 : 0, attributes:[{name:"Colour",value:colour},{name:"RAM",value:ram},{name:"Storage",value:storage}] });
const product = (variants) => ({hasVariants:true,variantOptions:["Colour","Storage","RAM"],variants});

test("two manually saved combinations never become four or eight purchasable configurations",()=>{
  const black=v("black","Black","8 GB","128 GB"); const blue=v("blue","Blue","12 GB","256 GB");
  const choices=buildVariantChoices(product([black,blue]),black);
  assert.equal(choices.colours.length,2);
  assert.equal(choices.configurations.length,2);
  assert.equal(choices.configurations.filter((c)=>c.target).length,1);
  assert.equal(choices.configurations[0].target,black);
  assert.equal(choices.configurations[1].target,undefined);
  assert.equal(choices.colours.find((c)=>c.value==="Blue").target,blue);
});

test("switching colour preserves the selected configuration when that exact variant exists",()=>{
  const black=v("black","Black","8 GB","128 GB");const blueSmall=v("blue-small","Blue","8 GB","128 GB");const blueLarge=v("blue-large","Blue","12 GB","256 GB");
  const choices=buildVariantChoices(product([black,blueLarge,blueSmall]),black);
  assert.equal(choices.colours.find((c)=>c.value==="Blue").target,blueSmall);
  assert.deepEqual(choices.configurationNames,["RAM","Storage"]);
});

test("a different colour selects a real stocked variant if the previous configuration does not exist",()=>{
  const black=v("black","Black","8 GB","128 GB");const sold=v("sold","Blue","12 GB","256 GB",false);const stocked=v("stocked","Blue","16 GB","512 GB");
  const choices=buildVariantChoices(product([black,sold,stocked]),black);
  assert.equal(choices.colours.find((c)=>c.value==="Blue").target,stocked);
  const selectedBlue=buildVariantChoices(product([black,sold,stocked]),stocked);
  assert.equal(selectedBlue.configurations.find((c)=>c.values[0]==="8 GB").target,undefined);
});

test("an existing sold-out configuration can be inspected without being presented as in stock",()=>{
  const black=v("black","Black","8 GB","128 GB");const sold=v("sold","Black","12 GB","256 GB",false);
  const choices=buildVariantChoices(product([black,sold]),black);
  assert.equal(choices.configurations[1].target,sold);
  assert.equal(choices.configurations[1].target.inStock,false);
  assert.equal(choices.configurations[1].target.maxQuantity,0);
});

test("colour-only and storage-only products do not get empty selection groups",()=>{
  const colourOnly={hasVariants:true,variantOptions:["Colour"],variants:[{_id:"c",inStock:true,attributes:[{name:"Colour",value:"Black"}]}]};
  assert.equal(buildVariantChoices(colourOnly).configurations.length,0);
  const storageOnly={hasVariants:true,variantOptions:["Storage"],variants:[{_id:"s",inStock:true,attributes:[{name:"Storage",value:"128 GB"}]}]};
  const choices=buildVariantChoices(storageOnly);
  assert.equal(choices.colours.length,0);assert.equal(choices.configurations.length,1);assert.equal(choices.configurations[0].target._id,"s");
});
