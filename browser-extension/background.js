chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: "https://mil-abbreviation.vercel.app/" });
});
