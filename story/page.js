/* 鏢局故事：介紹卡片＋每一章一整個畫面（圖文左右交錯） */
(function () {
    const A = window.ASC;
    const { $, esc } = A;
    function render() {
        const st = window.ASC_STORY[A.lang] ?? window.ASC_STORY.zh;
        $("about").innerHTML = st.about.map((a, i) => `<div class="card reveal d${i % 3 + 1}"><h3>${esc(a.title)}</h3><p>${esc(a.text)}</p></div>`).join("");
        $("chapters").innerHTML = st.chapters.map((c, i) => `<section class="screen"><div class="chap ${i % 2 ? "flip" : ""}">
  <div class="text reveal"><h2><small>${esc(c.tag)}</small>${esc(c.title)}</h2>${c.text.map((p) => `<p>${esc(p)}</p>`).join("")}</div>
  <div class="art reveal d1 ${c.img.length > 1 ? "multi" : ""}">${c.img.map((f) => `<img src="../assets/${f}" alt="" loading="lazy" data-zoom>`).join("")}</div>
</div></section>`).join("");
        A.bindZoom();
    }
    document.addEventListener("DOMContentLoaded", render);
    A.onLang(render);
})();
