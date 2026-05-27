import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { Coins, LogIn, LogOut, Plus, RotateCcw, Save, Settings, Trash2, Trophy } from "lucide-react";
import { auth, db, firebaseReady, loginWithGoogle, logout } from "./firebase";
import "./style.css";

type Character = { id: string; name: string; memo: string; order: number };
type Boss = { id: string; order: number; name: string; difficulty: string; cycle: string; price: number };
type Run = { id: string; characterId: string; bossId: string; cleared: boolean; partySize: number; overridePrice: string; memo: string };
type AppState = { characters: Character[]; bosses: Boss[]; runs: Run[]; selectedCharacterId: string };

const LOCAL_KEY = "maple-crystal-manager-firebase-v1";
const SELL_LIMIT = 12;

const bossSeed: [string, string, string][] = [
  ["ジャクム", "Easy", "日"], ["ジャクム", "Normal", "日"], ["ジャクム", "Chaos", "週"],
  ["ヒルラ", "Normal", "日"], ["ヒルラ", "Hard", "週"],
  ["ホーンテイル", "Easy", "日"], ["ホーンテイル", "Normal", "日"], ["ホーンテイル", "Chaos", "週"],
  ["ヴァンレオン", "Easy", "日"], ["ヴァンレオン", "Normal", "日"], ["ヴァンレオン", "Hard", "週"],
  ["アカイラム", "Easy", "日"], ["アカイラム", "Normal", "日"],
  ["ランマル", "Normal", "日"], ["ランマル", "Hard", "週"],
  ["ピンクビーン", "Normal", "日"], ["ピンクビーン", "Chaos", "週"],
  ["シグナス", "Easy", "週"], ["シグナス", "Normal", "週"],
  ["マグナス", "Easy", "日"], ["マグナス", "Normal", "日"], ["マグナス", "Hard", "週"],
  ["ビシャスプラント", "Easy", "日"], ["ビシャスプラント", "Normal", "日"], ["ビシャスプラント", "Chaos", "週"],
  ["ブラッディクイーン", "Normal", "日"], ["ブラッディクイーン", "Chaos", "週"],
  ["ピエール", "Normal", "日"], ["ピエール", "Chaos", "週"],
  ["バンバン", "Normal", "日"], ["バンバン", "Chaos", "週"],
  ["ベルルム", "Normal", "日"], ["ベルルム", "Chaos", "週"],
  ["アケチミツヒデ", "Normal", "週"],
  ["スウ", "Normal", "週"], ["スウ", "Hard", "週"], ["スウ", "Extreme", "週"],
  ["デミアン", "Normal", "週"], ["デミアン", "Hard", "週"],
  ["ガーディアンエンジェルスライム", "Normal", "週"], ["ガーディアンエンジェルスライム", "Chaos", "週"],
  ["ルシード", "Easy", "週"], ["ルシード", "Normal", "週"], ["ルシード", "Hard", "週"],
  ["ウィル", "Easy", "週"], ["ウィル", "Normal", "週"], ["ウィル", "Hard", "週"],
  ["ダスク", "Normal", "週"], ["ダスク", "Chaos", "週"],
  ["真ヒルラ", "Normal", "週"], ["真ヒルラ", "Hard", "週"],
  ["デュンケル", "Normal", "週"], ["デュンケル", "Hard", "週"],
  ["暗黒の魔法使い", "Hard", "月"], ["暗黒の魔法使い", "Extreme", "月"],
  ["選ばれし者セレン", "Normal", "週"], ["選ばれし者セレン", "Hard", "週"], ["選ばれし者セレン", "Extreme", "週"],
  ["監視者カロス", "Easy", "週"], ["監視者カロス", "Normal", "週"], ["監視者カロス", "Chaos", "週"], ["監視者カロス", "Extreme", "週"],
  ["カリーン", "Easy", "週"], ["カリーン", "Normal", "週"], ["カリーン", "Hard", "週"], ["カリーン", "Extreme", "週"],
  ["リンボ", "Normal", "週"], ["リンボ", "Hard", "週"],
  ["バルドリックス", "Normal", "週"], ["バルドリックス", "Hard", "週"],
  ["対敵者", "Normal", "週"], ["対敵者", "Hard", "週"]
];

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function makeBosses(): Boss[] {
  return bossSeed.map((b, i) => ({ id: uid(), order: i + 1, name: b[0], difficulty: b[1], cycle: b[2], price: 0 }));
}

function makeCharacters(): Character[] {
  return ["リン", "ユエ", "キャラ3", "キャラ4", "キャラ5", "キャラ6"].map((name, i) => ({ id: uid(), name, memo: "", order: i + 1 }));
}

function makeDefaultState(): AppState {
  const characters = makeCharacters();
  const bosses = makeBosses();
  return {
    characters,
    bosses,
    runs: characters.flatMap((c) =>
      bosses.filter((b) => b.cycle !== "日").map((b) => ({
        id: uid(),
        characterId: c.id,
        bossId: b.id,
        cleared: false,
        partySize: 1,
        overridePrice: "",
        memo: "",
      }))
    ),
    selectedCharacterId: characters[0].id,
  };
}

function yen(v: number) {
  return `${Math.round(v || 0).toLocaleString()} メル`;
}

function bossLabel(b?: Boss) {
  return b ? `${b.name} ${b.difficulty}` : "未選択";
}

function migrate(s: AppState): AppState {
  const bosses = [...(s.bosses || [])];
  const existing = new Set(bosses.map((b) => `${b.name}|${b.difficulty}`));
  bossSeed.forEach((seed) => {
    const key = `${seed[0]}|${seed[1]}`;
    if (!existing.has(key)) bosses.push({ id: uid(), order: bosses.length + 1, name: seed[0], difficulty: seed[1], cycle: seed[2], price: 0 });
  });
  bosses.sort((a, b) => (a.order || 9999) - (b.order || 9999));
  return { ...s, bosses, selectedCharacterId: s.selectedCharacterId || s.characters[0]?.id };
}

function App() {
  const [state, setState] = useState<AppState>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      return raw ? migrate(JSON.parse(raw)) : makeDefaultState();
    } catch {
      return makeDefaultState();
    }
  });
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<"summary" | "runs" | "bosses" | "settings">("summary");
  const [loadedCloud, setLoadedCloud] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u && db) {
        const ref = doc(db, "users", u.uid, "app", "crystals");
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setState(migrate(snap.data() as AppState));
        } else {
          await setDoc(ref, state);
        }
        setLoadedCloud(true);
      } else {
        setLoadedCloud(false);
      }
    });
  }, []);

  useEffect(() => {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
  }, [state]);

  async function saveCloud(next = state) {
    if (!user || !db) return;
    setSaving(true);
    await setDoc(doc(db, "users", user.uid, "app", "crystals"), next);
    setSaving(false);
  }

  function updateState(fn: (s: AppState) => AppState) {
    setState((prev) => {
      const next = fn(prev);
      if (user) saveCloud(next);
      return next;
    });
  }

  const bossMap = useMemo(() => new Map(state.bosses.map((b) => [b.id, b])), [state.bosses]);
  const selectedCharacter = state.characters.find((c) => c.id === state.selectedCharacterId) || state.characters[0];

  const enrichedRuns = useMemo(() => state.runs.map((r) => {
    const boss = bossMap.get(r.bossId);
    const base = r.overridePrice !== "" ? Number(r.overridePrice) : Number(boss?.price || 0);
    const share = base / Math.max(1, Number(r.partySize || 1));
    return { ...r, boss, base, share };
  }), [state.runs, bossMap]);

  const summary = useMemo(() => state.characters.map((c) => {
    const cleared = enrichedRuns.filter((r) => r.characterId === c.id && r.cleared);
    const sold = [...cleared].sort((a, b) => b.share - a.share).slice(0, SELL_LIMIT);
    return { character: c, cleared: cleared.length, sold: sold.length, income: sold.reduce((s, r) => s + r.share, 0) };
  }), [state.characters, enrichedRuns]);

  const totalIncome = summary.reduce((s, r) => s + r.income, 0);
  const totalCleared = summary.reduce((s, r) => s + r.cleared, 0);
  const totalSold = summary.reduce((s, r) => s + r.sold, 0);

  const sellSet = useMemo(() => new Set(
    enrichedRuns
      .filter((r) => r.characterId === selectedCharacter?.id && r.cleared)
      .sort((a, b) => b.share - a.share)
      .slice(0, SELL_LIMIT)
      .map((r) => r.id)
  ), [enrichedRuns, selectedCharacter]);

  const shownRuns = enrichedRuns
    .filter((r) => r.characterId === selectedCharacter?.id)
    .filter((r) => bossLabel(r.boss).toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (a.boss?.order || 9999) - (b.boss?.order || 9999));

  function setRun(id: string, patch: Partial<Run>) {
    updateState((s) => ({ ...s, runs: s.runs.map((r) => r.id === id ? { ...r, ...patch } : r) }));
  }

  function setBoss(id: string, patch: Partial<Boss>) {
    updateState((s) => ({ ...s, bosses: s.bosses.map((b) => b.id === id ? { ...b, ...patch } : b).sort((a, b) => (a.order || 9999) - (b.order || 9999)) }));
  }

  function setCharacter(id: string, patch: Partial<Character>) {
    updateState((s) => ({ ...s, characters: s.characters.map((c) => c.id === id ? { ...c, ...patch } : c) }));
  }

  function addCharacter() {
    updateState((s) => {
      const c = { id: uid(), name: `キャラ${s.characters.length + 1}`, memo: "", order: s.characters.length + 1 };
      const runs = s.bosses.filter((b) => b.cycle !== "日").map((b) => ({ id: uid(), characterId: c.id, bossId: b.id, cleared: false, partySize: 1, overridePrice: "", memo: "" }));
      return { ...s, characters: [...s.characters, c], runs: [...s.runs, ...runs], selectedCharacterId: c.id };
    });
  }

  function deleteCharacter(characterId: string) {
    if (state.characters.length <= 1) {
      alert("最低1キャラは必要です");
      return;
    }
    const target = state.characters.find((c) => c.id === characterId);
    if (!confirm(`${target?.name || "このキャラ"}を削除しますか？\nこのキャラのボス入力データも削除されます。`)) return;

    updateState((s) => {
      const characters = s.characters.filter((c) => c.id !== characterId).map((c, i) => ({ ...c, order: i + 1 }));
      const runs = s.runs.filter((r) => r.characterId !== characterId);
      const selectedCharacterId = s.selectedCharacterId === characterId ? characters[0].id : s.selectedCharacterId;
      return { ...s, characters, runs, selectedCharacterId };
    });
  }

  function addRun() {
    const boss = state.bosses.find((b) => b.cycle !== "日") || state.bosses[0];
    updateState((s) => ({ ...s, runs: [...s.runs, { id: uid(), characterId: selectedCharacter.id, bossId: boss.id, cleared: false, partySize: 1, overridePrice: "", memo: "" }] }));
  }

  function resetWeek() {
    if (!confirm("全キャラの討伐チェックを外しますか？")) return;
    updateState((s) => ({ ...s, runs: s.runs.map((r) => ({ ...r, cleared: false })) }));
  }

  function resetBosses() {
    if (!confirm("ボス一覧を初期状態に戻しますか？価格は引き継げるものだけ引き継ぎます。")) return;
    updateState((s) => {
      const oldPrice = new Map(s.bosses.map((b) => [`${b.name}|${b.difficulty}`, b.price]));
      const bosses = makeBosses();
      bosses.forEach((b) => b.price = Number(oldPrice.get(`${b.name}|${b.difficulty}`) || 0));
      return { ...s, bosses };
    });
  }

  async function forceSave() {
    await saveCloud();
    alert("保存しました");
  }

  return (
    <div className="app">
      <header className="hero">
        <div>
          <div className="pill"><Coins size={16} /> Boss Crystal Manager</div>
          <h1>ボス結晶だけ管理</h1>
          <p>キャラ別に討伐チェック、PT人数割り、高い順12個売却を自動計算。FirebaseでPC/iPhone同期。</p>
        </div>
        <div className="actions">
          {firebaseReady ? user ? (
            <>
              <button className="ghost" onClick={forceSave}><Save size={16} />{saving ? "保存中" : "保存"}</button>
              <button className="ghost" onClick={logout}><LogOut size={16} />ログアウト</button>
            </>
          ) : (
            <button className="primary" onClick={loginWithGoogle}><LogIn size={16} />Googleで同期</button>
          ) : <span className="badge warn">Firebase未設定</span>}
          <button className="ghost" onClick={resetWeek}><RotateCcw size={16} />週リセット</button>
        </div>
      </header>

      <section className="stats">
        <div className="card"><span>週合計収益</span><b>{yen(totalIncome)}</b></div>
        <div className="card"><span>討伐数</span><b>{totalCleared} 件</b></div>
        <div className="card"><span>売却対象</span><b>{totalSold} / {state.characters.length * SELL_LIMIT}</b></div>
        <div className="card"><span>同期</span><b>{user ? (loadedCloud ? "ON" : "読込中") : "OFF"}</b></div>
      </section>

      <nav className="tabs">
        <button className={tab === "summary" ? "active" : ""} onClick={() => setTab("summary")}>集計</button>
        <button className={tab === "runs" ? "active" : ""} onClick={() => setTab("runs")}>入力</button>
        <button className={tab === "bosses" ? "active" : ""} onClick={() => setTab("bosses")}>ボス価格</button>
        <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>設定</button>
      </nav>

      {tab === "summary" && (
        <main className="grid">
          {summary.map((row) => (
            <button key={row.character.id} className={`charCard ${row.character.id === selectedCharacter?.id ? "selected" : ""}`} onClick={() => { updateState((s) => ({ ...s, selectedCharacterId: row.character.id })); setTab("runs"); }}>
              <div className="charTop"><strong>{row.character.name}</strong><span className={row.sold >= SELL_LIMIT ? "badge ok" : "badge"}>{row.sold}/{SELL_LIMIT}</span></div>
              <p>{row.character.memo || "メモなし"}</p>
              <div className="income">{yen(row.income)}</div>
              <div className="mini"><span>討伐 {row.cleared}</span><span>残り {Math.max(0, SELL_LIMIT - row.sold)}</span></div>
            </button>
          ))}
        </main>
      )}

      {tab === "runs" && (
        <main className="panel">
          <div className="toolbar">
            <select value={selectedCharacter?.id} onChange={(e) => updateState((s) => ({ ...s, selectedCharacterId: e.target.value }))}>
              {state.characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input placeholder="ボス検索" value={search} onChange={(e) => setSearch(e.target.value)} />
            <button className="primary" onClick={addRun}><Plus size={16} />追加</button>
          </div>
          <div className="runList">
            {shownRuns.map((r) => (
              <div key={r.id} className="runCard">
                <label className="check"><input type="checkbox" checked={r.cleared} onChange={(e) => setRun(r.id, { cleared: e.target.checked })} /><strong>{bossLabel(r.boss)}</strong></label>
                <span className={r.cleared && sellSet.has(r.id) ? "badge sell" : "badge"}>{r.cleared && sellSet.has(r.id) ? "売却対象" : "除外"}</span>
                <select value={r.bossId} onChange={(e) => setRun(r.id, { bossId: e.target.value })}>
                  {state.bosses.map((b) => <option key={b.id} value={b.id}>{bossLabel(b)}</option>)}
                </select>
                <label>PT人数<input type="number" min={1} value={r.partySize} onChange={(e) => setRun(r.id, { partySize: Math.max(1, Number(e.target.value || 1)) })} /></label>
                <label>上書き価格<input type="number" placeholder="空欄でマスタ" value={r.overridePrice} onChange={(e) => setRun(r.id, { overridePrice: e.target.value })} /></label>
                <div className="share"><span>取り分</span><b>{yen(r.share)}</b></div>
                <input placeholder="メモ" value={r.memo} onChange={(e) => setRun(r.id, { memo: e.target.value })} />
                <button className="danger" onClick={() => updateState((s) => ({ ...s, runs: s.runs.filter((x) => x.id !== r.id) }))}><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        </main>
      )}

      {tab === "bosses" && (
        <main className="panel">
          <div className="toolbar"><button className="ghost" onClick={resetBosses}>ボス一覧を初期化</button></div>
          <div className="bossList">
            {state.bosses.map((b) => (
              <div className="bossRow" key={b.id}>
                <input type="number" value={b.order} onChange={(e) => setBoss(b.id, { order: Number(e.target.value || 0) })} />
                <input value={b.name} onChange={(e) => setBoss(b.id, { name: e.target.value })} />
                <input value={b.difficulty} onChange={(e) => setBoss(b.id, { difficulty: e.target.value })} />
                <select value={b.cycle} onChange={(e) => setBoss(b.id, { cycle: e.target.value })}><option>日</option><option>週</option><option>月</option></select>
                <input type="number" value={b.price} onChange={(e) => setBoss(b.id, { price: Number(e.target.value || 0) })} />
              </div>
            ))}
          </div>
        </main>
      )}

      {tab === "settings" && (
        <main className="panel">
          <div className="toolbar">
            <button className="primary" onClick={addCharacter}><Plus size={16} />結晶売却キャラを追加</button>
            <span className="badge">現在 {state.characters.length} キャラ / 売却枠 {state.characters.length * SELL_LIMIT} 個</span>
          </div>
          <div className="settingsList">
            {state.characters.map((c, i) => (
              <div className="settingRow" key={c.id}>
                <span>キャラ{i + 1}</span>
                <input value={c.name} onChange={(e) => setCharacter(c.id, { name: e.target.value })} />
                <input placeholder="メモ" value={c.memo} onChange={(e) => setCharacter(c.id, { memo: e.target.value })} />
                <button className="danger" onClick={() => deleteCharacter(c.id)}><Trash2 size={16} />削除</button>
              </div>
            ))}
          </div>
          <div className="note">
            「結晶売却キャラを追加」を押すと、その時点のボス価格マスタを元に新しいキャラのボス枠が自動作成されます。<br />
            各キャラごとに高い順12個だけ売却対象として集計します。キャラ数を増やすと合計売却枠も自動で増えます。<br />
            Firebase未設定でもローカル保存で使えます。PC/iPhone同期する場合はFirebase設定を入れてGoogleログインしてください。
          </div>
        </main>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
