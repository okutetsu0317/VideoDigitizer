const search = document.getElementById('guideSearch');
const sections = [...document.querySelectorAll('.guide-topic')];
const links = [...document.querySelectorAll('#contents a')];
if (matchMedia('(max-width:760px)').matches) document.querySelector('aside details').open = false;
const normalize = text => text.normalize('NFKC').toLowerCase().trim();
function filter() {
  const words = normalize(search.value).split(/\s+/).filter(Boolean);
  let count = 0;
  for (const section of sections) {
    const haystack = normalize(section.textContent + ' ' + section.dataset.tags);
    section.hidden = !words.every(word => haystack.includes(word));
    if (!section.hidden) count++;
  }
  for (const group of document.querySelectorAll('.guide-group')) {
    group.hidden = ![...group.querySelectorAll('.guide-topic')].some(section => !section.hidden);
  }
  for (const link of links) link.hidden = document.getElementById(link.hash.slice(1)).hidden;
  document.getElementById('searchStatus').textContent = words.length ? count + '件の項目' : '';
  document.getElementById('noResults').hidden = count !== 0;
}
function revealHash() {
  const section = sections.find(item => item.id === location.hash.slice(1));
  if (!section) return;
  search.value = ''; filter();
  section.scrollIntoView({block:'start'});
}
search.addEventListener('input',filter);
document.getElementById('clearSearch').addEventListener('click',()=>{search.value='';filter();search.focus();});
window.addEventListener('hashchange',revealHash);
for (const anchor of document.querySelectorAll('a[href^="#"]')) {
  anchor.addEventListener('click',()=>{search.value='';filter();});
}
revealHash();
