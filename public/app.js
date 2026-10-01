import { DEFAULT_SETTINGS, LEAD_DIMENSIONS, pct, triage } from "./logic.js";

const SETTINGS_KEY = "inbound-triage-settings";
const TEAM_LABELS = {
  billing: "Billing", technical: "Technical", account_access: "Account access", data_privacy: "Data & privacy", other: "Other",
};

let items = [];
let settings = loadSettings();

// Email content is untrusted, so the DOM is built with textContent only.
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) if (child) node.append(child);
  return node;
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null");
    if (saved) return { ...DEFAULT_SETTINGS, ...saved, weights: { ...DEFAULT_SETTINGS.weights, ...saved.weights } };
  } catch {}
  return structuredClone(DEFAULT_SETTINGS);
}

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
}

function bindSlider(input, get, set, format) {
  const output = input.nextElementSibling;
  input.value = get();
  output.textContent = format(get());
  input.addEventListener("input", () => {
    set(Number(input.value));
    output.textContent = format(Number(input.value));
    saveSettings();
    render();
  });
}

function buildControls() {
  bindSlider(document.getElementById("threshold"), () => settings.reviewThreshold, (v) => { settings.reviewThreshold = v; }, pct);
  bindSlider(document.getElementById("fit-floor"), () => settings.fitFloor, (v) => { settings.fitFloor = v; }, (v) => v.toFixed(2));
  const box = document.getElementById("weights");
  for (const { key, label } of LEAD_DIMENSIONS) {
    const id = `w-${key}`;
    const input = el("input", { id, type: "range", min: "0", max: "3", step: "0.5" });
    box.append(el("label", { for: id, text: `Lead weight: ${label}` }), el("div", { class: "slider" }, [input, el("output", { for: id })]));
    bindSlider(input, () => settings.weights[key], (v) => { settings.weights[key] = v; }, (v) => v.toFixed(1));
  }
}

function probabilityRows(answer) {
  if (answer.type === "noul") {
    return [row("yes", answer.noul, answer.noul >= 0.5), row("no", 1 - answer.noul, answer.noul < 0.5)];
  }
  const entries = Object.entries(answer.probabilities);
  const best = Math.max(...entries.map(([, p]) => p));
  return entries.map(([label, p]) => {
    const name = answer.type === "score" ? `${label}: ${answer.legend[label]}` : label;
    return row(name, p, p === best);
  });
}

function row(name, p, win) {
  const label = el("span", { text: name.length > 34 ? `${name.slice(0, 33)}…` : name, title: name });
  const track = el("div", { class: "track" }, el("div", { class: "fill", style: `width:${Math.round(p * 100)}%` }));
  return el("div", { class: `row${win ? " win" : ""}` }, [label, track, el("span", { class: "num", text: pct(p) })]);
}

function answerBlock(title, answer) {
  let summary = "";
  if (answer.type === "choice") summary = `${answer.choice} · confidence ${pct(answer.confidence)}`;
  if (answer.type === "score") summary = `${answer.score.toFixed(2)} of 3 · confidence ${pct(answer.confidence)}`;
  if (answer.type === "noul") summary = `${pct(answer.noul)} yes`;
  return el("div", { class: "answer" }, [el("div", { class: "name", text: `${title}: ${summary}` }), ...probabilityRows(answer)]);
}

function details(item, keys) {
  const blocks = keys.map(([key, title]) => answerBlock(title, item.answers[key]));
  return el("details", {}, [
    el("summary", { text: "Show email and TypeSafe answers" }),
    el("div", { class: "body", text: item.message.body }),
    ...blocks,
    el("p", { class: "hint", text: `Model ${item.model} · ${item.usage.input_tokens} in / ${item.usage.output_tokens} out tokens` }),
  ]);
}

function card(item, side, tags, keys) {
  const m = item.message;
  const from = [m.from_name, m.from_email && `<${m.from_email}>`].filter(Boolean).join(" ");
  return el("article", { class: "card" }, [
    el("div", { class: "top" }, [el("div", {}, [el("div", { class: "subject", text: m.subject || "(no subject)" }), el("div", { class: "from", text: from })]), side]),
    el("p", { class: "snippet", text: m.body }),
    el("div", { class: "tags" }, tags.filter(Boolean)),
    details(item, keys),
  ]);
}

const tag = (text, cls = "") => el("span", { class: `tag ${cls}`, text });
const KIND = [["kind", "Kind"]];
const SUPPORT_KEYS = [...KIND, ["support_team", "Team"], ["support_urgency", "Urgency"], ["support_churn_risk", "Churn risk"]];
const LEAD_KEYS = [...KIND, ...LEAD_DIMENSIONS.map((d) => [d.key, d.label])];

function render() {
  const queues = triage(items, settings);
  const fill = (name, cards) => {
    document.getElementById(`c-${name}`).textContent = String(queues[name].length);
    const box = document.getElementById(`q-${name}`);
    box.replaceChildren(...(cards.length ? cards : [el("p", { class: "empty", text: "Nothing here." })]));
  };

  fill("review", queues.review.map((it) =>
    card(it, null, [tag(it.routing.reason, "warn")], [...KIND, ...SUPPORT_KEYS.slice(1), ...LEAD_KEYS.slice(1)])));

  fill("support", queues.support.map((it) => {
    const s = it.support;
    return card(it, el("span", { class: `tag ${s.priority.toLowerCase()}`, text: s.priority }), [
      tag(TEAM_LABELS[it.answers.support_team.choice]),
      tag(`Urgency ${it.answers.support_urgency.score.toFixed(1)}/3`),
      s.churnRisk && tag(`Churn risk ${pct(it.answers.support_churn_risk.noul)}`, "bad"),
    ], SUPPORT_KEYS);
  }));

  fill("sales", queues.sales.map((it) => {
    const l = it.lead;
    return card(it, el("span", { class: `big${l.disqualified ? " dim" : ""}`, text: String(l.score) }), [
      l.disqualified ? tag(l.reason, "bad") : tag("Qualified", "good"),
      ...LEAD_DIMENSIONS.map((d) => tag(`${d.label} ${it.answers[d.key].score.toFixed(1)}`)),
    ], LEAD_KEYS);
  }));

  fill("archive", queues.archive.map((it) => card(it, null, [tag(it.routing.reason)], KIND)));
}

async function api(path, options) {
  const res = await fetch(path, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

function applyInbox(data) {
  items = data.items;
  document.getElementById("mock-banner").hidden = data.mode !== "mock";
  render();
}

document.getElementById("new-message").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button");
  const error = document.getElementById("form-error");
  error.hidden = true;
  button.disabled = true;
  try {
    const item = await api("/api/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    items = [item, ...items];
    form.reset();
    render();
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
  } finally {
    button.disabled = false;
  }
});

document.getElementById("reset").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  if (!confirm("Replace the inbox with the sample messages? Pasted emails will be removed.")) return;
  button.disabled = true;
  try {
    applyInbox(await api("/api/reset", { method: "POST" }));
  } catch (err) {
    alert(err.message);
  } finally {
    button.disabled = false;
  }
});

buildControls();
api("/api/inbox").then(applyInbox).catch((err) => alert(err.message));
