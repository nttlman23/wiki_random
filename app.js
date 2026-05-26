const API_WIKI = (lang, params) =>
  `https://${lang}.wikipedia.org/w/api.php?${params}`;

const UI = {
  lang: document.getElementById("wiki-lang"),
  btnNext: document.getElementById("btn-next"),
  btnRetry: document.getElementById("btn-retry"),
  loading: document.getElementById("state-loading"),
  error: document.getElementById("state-error"),
  errorMessage: document.getElementById("error-message"),
  cardStack: document.getElementById("card-stack"),
  cardHint: document.getElementById("card-hint"),
  cardStrip: document.getElementById("card-strip"),
  article: document.getElementById("article"),
  title: document.getElementById("article-title"),
  link: document.getElementById("article-link"),
  date: document.getElementById("article-date"),
  figure: document.getElementById("article-figure"),
  image: document.getElementById("article-image"),
  extract: document.getElementById("article-extract"),
  wikiGame: document.getElementById("wiki-game"),
  wikiGameResults: document.getElementById("wiki-game-results"),
};

const WIKI_REMOVE_SELECTORS = [
  "table.infobox",
  "table.infobox-v2",
  ".infobox",
  ".infobox-v2",
  ".sidebar",
  ".navbox",
  ".vertical-navbox",
  ".metadata",
  ".reference",
  ".mw-references-wrap",
  ".references",
  "ol.references",
  ".reflist",
  ".reference-text",
  "sup.reference",
  ".mw-ref",
  ".mw-cite",
  "cite",
  ".noprint",
  ".mw-empty-elt",
  ".mw-kartographer-maplink",
  ".thumb",
  ".magnify",
  ".toc",
  "#toc",
  ".hatnote",
  ".ambox",
  ".mw-editsection",
  'link[rel="mw-deduplicated-inline-style"]',
  "style",
];

const DISAMBIG_EXTRA_REMOVE = [
  ".ts-TOC_right",
  ".catlinks",
  ".mw-normal-catlinks",
  ".dablink",
];

let loading = false;
let currentPageTitle = null;
let pathAbortController = null;
let cardSwipeControls = null;

function updateCardHint() {
  const ru = UI.lang.value === "ru";
  const de = UI.lang.value === "de";
  const swipeText = ru
    ? "← Смахните влево"
    : de
      ? "← Nach links wischen"
      : "← Swipe left";
  const hintText = ru
    ? "Потяните карточку влево за цветную полоску или по тексту"
    : de
      ? "Karte nach links ziehen (am Streifen oder im Text)"
      : "Swipe the card left (strip or text area)";
  UI.cardHint.textContent = hintText;
  const stripLabel = document.getElementById("card-strip-label");
  if (stripLabel) stripLabel.textContent = swipeText;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderPathSteps(path, wikiLang, ru) {
  if (!path?.length) return "";

  const steps = path
    .map((title, i) => {
      const url = WikiPath.articleUrl(wikiLang, title);
      const isLast = i === path.length - 1;
      const arrow =
        i > 0
          ? `<span class="wiki-game__arrow" aria-hidden="true">→</span>`
          : "";
      const cls = isLast ? ` class="wiki-game__step-link wiki-game__step-link--target"` : ` class="wiki-game__step-link"`;
      return `${arrow}<a href="${url}"${cls} target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a>`;
    })
    .join("");

  return `
    <div class="wiki-game__route">
      <span class="wiki-game__route-label">${ru ? "Нажимать по порядку:" : "Click in order:"}</span>
      <div class="wiki-game__steps">${steps}</div>
    </div>
  `;
}

function formatPathResult(item, uiLang) {
  const { target, clicks, reason, startTitle, error, path } = item;
  const ru = uiLang === "ru";

  let clicksText;
  let className = "wiki-game__clicks";

  if (clicks === 0) {
    clicksText = ru ? "0 кликов (уже целевая статья)" : "0 clicks (already the target)";
    className += " wiki-game__clicks--found";
  } else if (typeof clicks === "number") {
    const word =
      clicks === 1
        ? ru
          ? "клик"
          : "click"
        : clicks < 5
          ? ru
            ? "клика"
            : "clicks"
          : ru
            ? "кликов"
            : "clicks";
    clicksText = `${clicks} ${word}`;
    className += " wiki-game__clicks--found";
  } else if (reason === "no-langlink") {
    clicksText = ru
      ? "нет языковой версии для старта"
      : "no language version to start from";
    className += " wiki-game__clicks--missing";
  } else if (reason === "depth") {
    const max = WikiPath.MAX_DEPTH;
    clicksText = ru ? `более ${max} кликов` : `more than ${max} clicks`;
    className += " wiki-game__clicks--missing";
  } else if (reason === "limit") {
    clicksText = ru ? "не найдено (лимит поиска)" : "not found (search limit)";
    className += " wiki-game__clicks--missing";
  } else if (reason === "error") {
    clicksText = ru ? `ошибка: ${error}` : `error: ${error}`;
    className += " wiki-game__clicks--missing";
  } else {
    clicksText = ru ? "не найдено" : "not found";
    className += " wiki-game__clicks--missing";
  }

  const routeHtml =
    path?.length && typeof clicks === "number"
      ? renderPathSteps(path, target.lang, ru)
      : "";

  const startHint =
    startTitle && reason !== "no-langlink" && !routeHtml
      ? `<span class="wiki-game__note">${ru ? "от" : "from"} «${escapeHtml(startTitle)}»</span>`
      : "";

  return `
    <li class="wiki-game__item">
      <div class="wiki-game__item-head">
        <span class="wiki-game__wiki">${target.label}</span>
        <span class="${className}">${clicksText}</span>
        ${startHint}
      </div>
      ${routeHtml}
      <a class="wiki-game__link" href="${target.url}" target="_blank" rel="noopener noreferrer">${ru ? "Цель:" : "Target:"} ${target.url}</a>
    </li>
  `;
}

function resetWikiGame() {
  pathAbortController?.abort();
  pathAbortController = null;
  UI.wikiGame.open = false;
  UI.wikiGameResults.innerHTML = "";
}

function showWikiGameLoading() {
  const ru = UI.lang.value === "ru";
  UI.wikiGameResults.innerHTML = `<li class="wiki-game__loading">${
    ru ? "Считаем пути…" : "Calculating paths…"
  }</li>`;
}

async function computeWikiPaths() {
  if (!currentPageTitle) return;

  pathAbortController?.abort();
  const ac = new AbortController();
  pathAbortController = ac;

  showWikiGameLoading();

  const results = await WikiPath.computeAll(
    UI.lang.value,
    currentPageTitle,
    ac.signal
  );

  if (ac.signal.aborted) return;

  UI.wikiGameResults.innerHTML = results
    .map((item) => formatPathResult(item, UI.lang.value))
    .join("");
}

function setView(view) {
  UI.loading.hidden = view !== "loading";
  UI.error.hidden = view !== "error";
  UI.cardStack.hidden = view !== "article";
  if (view !== "article") {
    UI.wikiGame.hidden = true;
    resetWikiGame();
  }
}

function scrollToCardAnchor(smooth = false) {
  const anchor = UI.cardStrip || UI.cardStack;
  if (!anchor) {
    window.scrollTo({ top: 0, left: 0, behavior: smooth ? "smooth" : "auto" });
    return;
  }

  const offset = 12;
  const top = anchor.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({
    top: Math.max(0, top),
    left: 0,
    behavior: smooth ? "smooth" : "auto",
  });
}

function stripHtml(html) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat(UI.lang.value, {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function wikiBase(lang) {
  return `https://${lang}.wikipedia.org`;
}

function wikiArticleUrl(lang, title) {
  return `${wikiBase(lang)}/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

function toHttpsUrl(url) {
  if (!url) return url;
  if (url.startsWith("//")) return `https:${url}`;
  return url;
}

function fixWikiLinks(container, lang) {
  const base = wikiBase(lang);

  container.querySelectorAll("a[href]").forEach((a) => {
    const href = a.getAttribute("href");
    if (!href || href.startsWith("#")) return;

    if (href.startsWith("//")) {
      a.href = `https:${href}`;
    } else if (href.startsWith("/wiki/")) {
      a.href = `${base}${href}`;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    } else if (href.startsWith("/w/")) {
      a.href = `https://commons.wikimedia.org${href.replace("/w/", "/wiki/")}`;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    } else if (href.startsWith("./")) {
      a.href = `${base}/wiki/${href.slice(2)}`;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    }
  });
}

function fixWikiImages(container) {
  container.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src");
    if (src) img.src = toHttpsUrl(src);

    const srcset = img.getAttribute("srcset");
    if (srcset) {
      img.srcset = srcset
        .split(",")
        .map((part) => {
          const bits = part.trim().split(/\s+/);
          bits[0] = toHttpsUrl(bits[0]);
          return bits.join(" ");
        })
        .join(", ");
    }

    img.removeAttribute("width");
    img.removeAttribute("height");
    img.loading = "lazy";
  });
}

function isSourceLink(href) {
  if (!href) return false;
  return (
    href.startsWith("#cite_") ||
    href.includes("cite_note") ||
    href.includes("cite_ref") ||
    href.startsWith("#ref-")
  );
}

function removeSourceLinks(container) {
  container.querySelectorAll("a[href]").forEach((a) => {
    if (isSourceLink(a.getAttribute("href"))) {
      a.remove();
    }
  });

  container.querySelectorAll("sup").forEach((sup) => {
    const text = sup.textContent.trim();
    if (
      sup.classList.contains("reference") ||
      /^\[\d+\]$/.test(text) ||
      !text
    ) {
      sup.remove();
    }
  });
}

function isDisambiguationCategory(title) {
  if (!title) return false;
  const t = title.toLowerCase();
  return (
    t.includes("disambiguation") ||
    t.includes("disambig") ||
    /страниц[аы] значений/.test(t) ||
    t.includes("wikipedia disambiguation")
  );
}

function trimToIntroOnly(container) {
  const firstHeading = container.querySelector("h2, h3");
  if (!firstHeading) return;

  const remove = [];
  let node = firstHeading;
  while (node) {
    remove.push(node);
    node = node.nextElementSibling;
  }
  remove.forEach((el) => el.remove());
}

function sanitizeWikiHtml(container, isDisambiguation = false) {
  const selectors = isDisambiguation
    ? [...WIKI_REMOVE_SELECTORS, ...DISAMBIG_EXTRA_REMOVE]
    : WIKI_REMOVE_SELECTORS;

  selectors.forEach((selector) => {
    container.querySelectorAll(selector).forEach((el) => el.remove());
  });

  if (isDisambiguation) {
    container
      .querySelectorAll(
        "table.navbox, table.vertical-navbox, table.metadata, table.toc"
      )
      .forEach((table) => table.remove());
  } else {
    container.querySelectorAll("table").forEach((table) => table.remove());
  }

  removeSourceLinks(container);

  if (!isDisambiguation) {
    trimToIntroOnly(container);
  }
}

function renderArticle(data) {
  const lang = UI.lang.value;
  const title = stripHtml(data.title || "");
  const pageUrl = data.pageUrl || "#";

  UI.title.textContent = title;
  UI.link.href = pageUrl;
  UI.link.textContent =
    lang === "ru" ? "Читать на Википедии →" : "Read on Wikipedia →";

  const dateStr = formatDate(data.touched);
  UI.date.textContent = dateStr
    ? lang === "ru"
      ? `Обновлено: ${dateStr}`
      : `Updated: ${dateStr}`
    : "";
  UI.date.hidden = !dateStr;

  if (data.thumbnail) {
    UI.image.src = data.thumbnail;
    UI.image.alt = title;
    UI.figure.hidden = false;
  } else {
    UI.figure.hidden = true;
    UI.image.removeAttribute("src");
  }

  UI.extract.innerHTML =
    data.html ||
    (lang === "ru"
      ? "<p>Краткое описание недоступно.</p>"
      : "<p>Summary not available.</p>");

  sanitizeWikiHtml(UI.extract, data.isDisambiguation);
  fixWikiLinks(UI.extract, lang);
  fixWikiImages(UI.extract);

  if (!UI.extract.textContent.trim()) {
    UI.extract.innerHTML =
      lang === "ru"
        ? "<p>Краткое описание недоступно.</p>"
        : "<p>Summary not available.</p>";
  }

  setView("article");
  currentPageTitle = data.pageTitle || title;
  resetWikiGame();
  UI.wikiGame.hidden = false;

  requestAnimationFrame(() => scrollToCardAnchor(data.smoothScroll));
}

async function fetchRandomTitle(lang) {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    list: "random",
    rnnamespace: "0",
    rnlimit: "1",
  });
  const res = await fetch(API_WIKI(lang, params));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.info || data.error.code);
  return data.query?.random?.[0]?.title;
}

async function fetchPageMeta(lang, title) {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    titles: title,
    prop: "pageprops|categories",
    cllimit: "50",
  });
  const res = await fetch(API_WIKI(lang, params));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const page = Object.values(data.query?.pages || {})[0];
  if (!page) return { isDisambiguation: false };

  const isDisambiguation =
    "disambiguation" in (page.pageprops || {}) ||
    (page.categories || []).some((c) => isDisambiguationCategory(c.title));

  return { isDisambiguation };
}

async function fetchIntroHtml(lang, title, isDisambiguation) {
  const parseParams = new URLSearchParams({
    action: "parse",
    format: "json",
    origin: "*",
    page: title,
    prop: "text|displaytitle",
    disableeditsection: "1",
  });

  if (!isDisambiguation) {
    parseParams.set("section", "0");
  }

  const res = await fetch(API_WIKI(lang, parseParams));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.info || data.error.code);

  const html = data.parse?.text?.["*"];
  if (html) {
    return {
      html,
      title: data.parse.displaytitle || data.parse.title || title,
      isDisambiguation,
    };
  }

  const fallbackParams = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    titles: title,
    prop: "extracts",
    explaintext: "0",
  });
  if (!isDisambiguation) {
    fallbackParams.set("exintro", "");
  }
  const fallbackRes = await fetch(API_WIKI(lang, fallbackParams));
  const fallbackData = await fallbackRes.json();
  const page = Object.values(fallbackData.query?.pages || {})[0];

  return {
    html: page?.extract || null,
    title: page?.title || title,
    isDisambiguation,
  };
}

async function fetchArticleContent(lang, title) {
  const imageParams = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    titles: title,
    prop: "pageimages|info",
    inprop: "url",
    piprop: "original|thumbnail",
  });

  const meta = await fetchPageMeta(lang, title);

  const [intro, imageRes] = await Promise.all([
    fetchIntroHtml(lang, title, meta.isDisambiguation),
    fetch(API_WIKI(lang, imageParams)),
  ]);

  if (!intro.html) throw new Error("empty response");

  let thumbnail = null;
  let pageUrl = wikiArticleUrl(lang, title);
  let touched = null;

  if (imageRes.ok) {
    const imageData = await imageRes.json();
    const page = Object.values(imageData.query?.pages || {})[0];
    if (page) {
      thumbnail = page.original?.source || page.thumbnail?.source || null;
      pageUrl = page.fullurl || pageUrl;
      touched = page.touched;
    }
  }

  return {
    title: stripHtml(intro.title),
    pageTitle: title,
    pageUrl,
    touched,
    thumbnail,
    html: intro.html,
    isDisambiguation: intro.isDisambiguation,
  };
}

async function loadRandomArticle(options = {}) {
  const { fromSwipe = false } = options;
  if (loading) return;
  loading = true;
  UI.btnNext.disabled = true;

  if (!fromSwipe) {
    setView("loading");
  } else {
    UI.cardStack.classList.add("card-stack--loading");
  }

  const lang = UI.lang.value;

  try {
    const title = await fetchRandomTitle(lang);
    if (!title) throw new Error("empty response");

    const article = await fetchArticleContent(lang, title);
    renderArticle({ ...article, smoothScroll: !fromSwipe });
    if (fromSwipe) {
      CardSwipe.playEnter(UI.article);
      cardSwipeControls?.resetTransform();
    }
    setView("article");
  } catch (err) {
    UI.errorMessage.textContent =
      lang === "ru"
        ? `Не удалось загрузить статью: ${err.message}. Проверьте подключение к интернету.`
        : `Failed to load article: ${err.message}. Check your internet connection.`;
    setView("error");
    cardSwipeControls?.resetTransform();
    UI.article.classList.remove("card--exit-left");
  } finally {
    loading = false;
    UI.btnNext.disabled = false;
    UI.cardStack.classList.remove("card-stack--loading");
  }
}

async function onCardSwipeLeft() {
  if (loading) return;
  cardSwipeControls?.resetTransform();
  await CardSwipe.playExitLeft(UI.article);
  await loadRandomArticle({ fromSwipe: true });
}

UI.btnNext.addEventListener("click", () => loadRandomArticle());
UI.btnRetry.addEventListener("click", () => loadRandomArticle());
UI.lang.addEventListener("change", () => {
  updateCardHint();
  loadRandomArticle();
});

UI.wikiGame.addEventListener("toggle", () => {
  if (UI.wikiGame.open && currentPageTitle) {
    computeWikiPaths();
  } else {
    pathAbortController?.abort();
  }
});

cardSwipeControls = CardSwipe.init(UI.article, { onSwipeLeft: onCardSwipeLeft });
updateCardHint();
loadRandomArticle();
