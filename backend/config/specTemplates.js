const templates = {
  mobile: ["RAM", "Storage", "Display", "Battery", "Camera", "OS"],
  laptop: ["CPU", "RAM", "SSD", "Screen"],
  earbuds: ["Battery", "Bluetooth", "ANC"],
};
const defaultSpecTemplate = (name = "") => {
  if (/mobile|phone/i.test(name)) return templates.mobile;
  if (/laptop|notebook/i.test(name)) return templates.laptop;
  if (/earbud|earphone|headphone|audio/i.test(name)) return templates.earbuds;
  return [];
};
module.exports = { defaultSpecTemplate };
