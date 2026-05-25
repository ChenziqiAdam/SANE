fetch('template.html')
  .then(r => r.text())
  .then(html => {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    document.getElementById('doc-nav-placeholder').replaceWith(tmp.querySelector('nav'));
    document.getElementById('doc-footer-placeholder').replaceWith(tmp.querySelector('footer'));
  });
