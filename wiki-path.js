const WikiPath = (() => {
  const API = (lang, params) =>
    `https://${lang}.wikipedia.org/w/api.php?${params}`;

  const TARGETS = [
    {
      lang: "ru",
      title: "Гитлер, Адольф",
      url: "https://ru.wikipedia.org/wiki/%D0%93%D0%B8%D1%82%D0%BB%D0%B5%D1%80,_%D0%90%D0%B4%D0%BE%D0%BB%D1%8C%D1%84",
      label: "ru.wikipedia",
    },
    {
      lang: "en",
      title: "Adolf Hitler",
      url: "https://en.wikipedia.org/wiki/Adolf_Hitler",
      label: "en.wikipedia",
    },
    {
      lang: "de",
      title: "Adolf Hitler",
      url: "https://de.wikipedia.org/wiki/Adolf_Hitler",
      label: "de.wikipedia",
    },
  ];

  const ALIASES = {
    ru: ["гитлер, адольф", "гитлер", "адольф гитлер"],
    en: ["adolf hitler", "hitler"],
    de: ["adolf hitler", "hitler"],
  };

  const MAX_DEPTH = 10;
  const MAX_VISITED = 5000;
  const BATCH_SIZE = 20;
  const MAX_FRONTIER = 100;

  function normalize(title) {
    return title.replace(/_/g, " ").trim().toLowerCase();
  }

  function articleUrl(lang, title) {
    return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
  }

  function matchesTarget(title, lang) {
    const norm = normalize(title);
    return ALIASES[lang].some((alias) => norm === alias);
  }

  function pathToStart(endTitle, prev, startTitle) {
    const path = [endTitle];
    let current = normalize(endTitle);

    while (prev.has(current)) {
      const from = prev.get(current);
      path.unshift(from);
      current = normalize(from);
    }

    if (normalize(path[0]) !== normalize(startTitle)) {
      path.unshift(startTitle);
    }

    return path;
  }

  async function apiGet(lang, params, signal) {
    const res = await fetch(API(lang, params), { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.info || data.error.code);
    return data;
  }

  async function fetchLanglink(fromLang, title, toLang, signal) {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      origin: "*",
      titles: title,
      prop: "langlinks",
      lllang: toLang,
      lllimit: "1",
    });
    const data = await apiGet(fromLang, params, signal);
    const page = Object.values(data.query?.pages || {})[0];
    return page?.langlinks?.[0]?.title || null;
  }

  async function fetchLinksForTitle(lang, title, signal) {
    const links = new Set();
    let params = new URLSearchParams({
      action: "query",
      format: "json",
      origin: "*",
      titles: title,
      prop: "links",
      plnamespace: "0",
      pllimit: "500",
    });

    while (true) {
      const data = await apiGet(lang, params, signal);
      const page = Object.values(data.query?.pages || {})[0];
      if (!page || page.missing) break;

      for (const link of page.links || []) {
        links.add(link.title);
      }

      const cont = data.continue?.plcontinue;
      if (!cont) break;
      params = new URLSearchParams(params);
      params.set("plcontinue", cont);
    }

    return links;
  }

  async function fetchLinksBatch(lang, titles, signal) {
    const result = new Map();
    for (let i = 0; i < titles.length; i += BATCH_SIZE) {
      const chunk = titles.slice(i, i + BATCH_SIZE);
      const params = new URLSearchParams({
        action: "query",
        format: "json",
        origin: "*",
        titles: chunk.join("|"),
        prop: "links",
        plnamespace: "0",
        pllimit: "500",
      });
      const data = await apiGet(lang, params, signal);

      for (const page of Object.values(data.query?.pages || {})) {
        if (!page?.title) continue;
        const set = new Set();
        for (const link of page.links || []) {
          set.add(link.title);
        }
        result.set(page.title, set);
      }
    }
    return result;
  }

  async function findClicks(startTitle, targetLang, signal) {
    if (matchesTarget(startTitle, targetLang)) {
      return { clicks: 0, reason: "same", path: [startTitle] };
    }

    const prev = new Map();
    const visited = new Set([normalize(startTitle)]);
    let frontier = [startTitle];

    for (let depth = 1; depth <= MAX_DEPTH; depth++) {
      if (signal?.aborted) return { clicks: null, reason: "aborted", path: null };
      if (visited.size >= MAX_VISITED) {
        return { clicks: null, reason: "limit", path: null };
      }

      const limited = frontier.slice(0, MAX_FRONTIER);
      const linkMap = await fetchLinksBatch(targetLang, limited, signal);
      const next = [];

      for (const pageTitle of limited) {
        let links = linkMap.get(pageTitle);
        if (!links || links.size === 0) {
          links = await fetchLinksForTitle(targetLang, pageTitle, signal);
        }

        for (const link of links) {
          if (matchesTarget(link, targetLang)) {
            const path = [...pathToStart(pageTitle, prev, startTitle), link];
            return { clicks: depth, reason: "found", path };
          }

          const norm = normalize(link);
          if (!visited.has(norm)) {
            visited.add(norm);
            prev.set(norm, pageTitle);
            next.push(link);
          }
        }
      }

      if (next.length === 0) {
        return { clicks: null, reason: "dead", path: null };
      }

      frontier = next;
    }

    return { clicks: null, reason: "depth", path: null };
  }

  async function resolveStart(sourceLang, sourceTitle, targetLang, signal) {
    if (sourceLang === targetLang) {
      return { title: sourceTitle, note: null };
    }
    const linked = await fetchLanglink(sourceLang, sourceTitle, targetLang, signal);
    if (!linked) {
      return { title: null, note: "no-langlink" };
    }
    return { title: linked, note: null };
  }

  async function computeAll(sourceLang, sourceTitle, signal) {
    const results = [];

    for (const target of TARGETS) {
      if (signal?.aborted) break;

      try {
        const start = await resolveStart(sourceLang, sourceTitle, target.lang, signal);
        if (!start.title) {
          results.push({ target, clicks: null, reason: "no-langlink", path: null });
          continue;
        }

        const pathResult = await findClicks(start.title, target.lang, signal);
        results.push({
          target,
          startTitle: start.title,
          clicks: pathResult.clicks,
          reason: pathResult.reason,
          path: pathResult.path,
        });
      } catch (err) {
        if (err.name === "AbortError") break;
        results.push({
          target,
          clicks: null,
          reason: "error",
          error: err.message,
          path: null,
        });
      }
    }

    return results;
  }

  return { TARGETS, MAX_DEPTH, articleUrl, computeAll };
})();
