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
type AppState = { characters: Character[]; bosses: Boss[]; runs: Run[]; selectedCharacterId: string; vipExtraSlots?: number };

const LOCAL_KEY = "maple-crystal-manager-firebase-v1";
const SELL_LIMIT = 12;

const bossSeed: [string, string, string, number][] = [
  ["シグナス", "Easy", "週", 7380000],
  ["ヒルラ", "Hard", "週", 9010000],
  ["ピンクビーン", "Chaos", "週", 9450000],
  ["シグナス", "Normal", "週", 10530000],
  ["ジャクム", "Chaos", "週", 11150000],
  ["ピエール", "Chaos", "週", 11150000],
  ["バンバン", "Chaos", "週", 11150000],
  ["ブラッディクイーン", "Chaos", "週", 11150000],
  ["マグナス", "Hard", "週", 12170000],
  ["ベルルム", "Chaos", "週", 13450000],
  ["ノウ姫", "Normal", "週", 14430000],
  ["ビシャス", "Chaos", "週", 16500000],
  ["アケチミツヒデ", "Normal", "週", 17970000],
  ["スウ", "Normal", "週", 20790000],
  ["デミアン", "Normal", "週", 22170000],
  ["ガーディアンエンジェルスライム", "Normal", "週", 30890000],
  ["ルシード", "Easy", "週", 37570000],
  ["ウィル", "Easy", "週", 41050000],
  ["ルシード", "Normal", "週", 43660000],
  ["ウィル", "Normal", "週", 49720000],
  ["ダスク", "Normal", "週", 53090000],
  ["デュンケル", "Normal", "週", 56560000],
  ["デミアン", "Hard", "週", 61690000],
  ["スウ", "Hard", "週", 63620000],
  ["ルシード", "Hard", "週", 70310000],
  ["ダスク", "Chaos", "週", 81360000],
  ["真ヒルラ", "Normal", "週", 82790000],
  ["ガーディアンエンジェルスライム", "Chaos", "週", 85530000],
  ["ウィル", "Hard", "週", 86220000],
  ["デュンケル", "Hard", "週", 90870000],
  ["真ヒルラ", "Hard", "週", 102500000],
  ["最初の対敵者", "Easy", "週", 146400000],
  ["セレン", "Normal", "週", 175000000],
  ["カロス", "Easy", "週", 178500000],
  ["セレン", "Hard", "週", 186040000],
  ["最初の対敵者", "Normal", "週", 221300000],
  ["カリーン", "Easy", "週", 225970000],
  ["カロス", "Normal", "週", 254000000],
  ["スウ", "Extreme", "週", 314380000],
  ["カリーン", "Normal", "週", 326370000],
  ["リンボ", "Normal", "週", 487740000],
  ["カロス", "Chaos", "週", 580000000],
  ["最初の対敵者", "Hard", "週", 652300000],
  ["暗黒の魔法使い", "Hard", "月", 677250000],
  ["バルドリックス", "Normal", "週", 700350000],
  ["カリーン", "Hard", "週", 862500000],
  ["リンボ", "Hard", "週", 984840000],
  ["セレン", "Extreme", "週", 1161600000],
  ["バルドリックス", "Hard", "週", 1163340000],
  ["最初の対敵者", "Extreme", "週", 1457000000],
  ["カロス", "Extreme", "週", 1684800000],
  ["カリーン", "Extreme", "週", 2099440000],
  ["暗黒の魔法使い", "Extreme", "月", 4000000000]
];

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function makeBosses(): Boss[] {
  return bossSeed.map((b, i) => ({ id: uid(), order: i + 1, name: b[0], difficulty: b[1], cycle: b[2], price: b[3] }));
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
    vipExtraSlots: 0,
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
  const seedMap = new Map(bossSeed.map((seed, i) => [`${seed[0]}|${seed[1]}`, { seed, order: i + 1 }]));
  const existing = new Set(bosses.map((b) => `${b.name}|${b.difficulty}`));
  bosses.forEach((boss) => {
    const found = seedMap.get(`${boss.name}|${boss.difficulty}`);
    if (found) {
      boss.order = found.order;
      boss.cycle = found.seed[2];
      if (!boss.price || boss.price === 0) boss.price = found.seed[3];
    }
  });
  bossSeed.forEach((seed, i) => {
    const key = `${seed[0]}|${seed[1]}`;
    if (!existing.has(key)) bosses.push({ id: uid(), order: i + 1, name: seed[0], difficulty: seed[1], cycle: seed[2], price: seed[3] });
  });
  bosses.sort((a, b) => (a.order || 9999) - (b.order || 9999));
  return { ...s, bosses, selectedCharacterId: s.selectedCharacterId || s.characters[0]?.id, vipExtraSlots: Number(s.vipExtraSlots || 0) };
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
  const [importText, setImportText] = useState("");
  const [importMode, setImportMode] = useState<"safe" | "party">("safe");

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
  const sellLimit = SELL_LIMIT + Math.max(0, Number(state.vipExtraSlots || 0));

  const enrichedRuns = useMemo(() => state.runs.map((r) => {
    const boss = bossMap.get(r.bossId);
    const base = r.overridePrice !== "" ? Number(r.overridePrice) : Number(boss?.price || 0);
    const share = base / Math.max(1, Number(r.partySize || 1));
    return { ...r, boss, base, share };
  }), [state.runs, bossMap]);

  const summary = useMemo(() => state.characters.map((c) => {
    const cleared = enrichedRuns.filter((r) => r.characterId === c.id && r.cleared);
    const sold = [...cleared].sort((a, b) => b.share - a.share).slice(0, sellLimit);
    return { character: c, cleared: cleared.length, sold: sold.length, income: sold.reduce((s, r) => s + r.share, 0) };
  }), [state.characters, enrichedRuns]);

  const totalIncome = summary.reduce((s, r) => s + r.income, 0);
  const totalCleared = summary.reduce((s, r) => s + r.cleared, 0);
  const totalSold = summary.reduce((s, r) => s + r.sold, 0);

  const sellSet = useMemo(() => new Set(
    enrichedRuns
      .filter((r) => r.characterId === selectedCharacter?.id && r.cleared)
      .sort((a, b) => b.share - a.share)
      .slice(0, sellLimit)
      .map((r) => r.id)
  ), [enrichedRuns, selectedCharacter]);

  const shownRuns = enrichedRuns
    .filter((r) => r.characterId === selectedCharacter?.id)
    .filter((r) => bossLabel(r.boss).toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (a.boss?.order || 9999) - (b.boss?.order || 9999));

  function getCheckedCountForCharacter(runs: Run[], characterId: string) {
    return runs.filter((r) => r.characterId === characterId && r.cleared).length;
  }

  function hasSameBossChecked(runs: Run[], targetRun: Run, nextBossId?: string) {
    const targetBoss = bossMap.get(nextBossId || targetRun.bossId);
    if (!targetBoss) return false;
    return runs.some((r) => {
      if (r.id === targetRun.id || r.characterId !== targetRun.characterId || !r.cleared) return false;
      const boss = bossMap.get(r.bossId);
      return boss?.name === targetBoss.name;
    });
  }

  function setRun(id: string, patch: Partial<Run>) {
    const target = state.runs.find((r) => r.id === id);
    if (!target) return;

    const wantsCheck = patch.cleared === true && !target.cleared;
    const nextBossId = patch.bossId || target.bossId;
    const nextRunsPreview = state.runs.map((r) => r.id === id ? { ...r, ...patch, bossId: nextBossId } : r);

    if (wantsCheck) {
      const currentCount = getCheckedCountForCharacter(state.runs, target.characterId);
      if (currentCount >= sellLimit) {
        alert(`このキャラは最大 ${sellLimit} 体まで選択できます。VIP追加枠は設定タブで変更できます。`);
        return;
      }
      if (hasSameBossChecked(state.runs, { ...target, bossId: nextBossId }, nextBossId)) {
        const boss = bossMap.get(nextBossId);
        alert(`${boss?.name || "同じボス"}は別難易度をすでに選択しています。同じボスは1難易度だけ選択できます。`);
        return;
      }
    }

    if (target.cleared && patch.bossId && hasSameBossChecked(state.runs, { ...target, bossId: patch.bossId }, patch.bossId)) {
      const boss = bossMap.get(patch.bossId);
      alert(`${boss?.name || "同じボス"}は別難易度をすでに選択しています。同じボスは1難易度だけ選択できます。`);
      return;
    }

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
      const bosses = makeBosses();
      return { ...s, bosses };
    });
  }

  async function forceSave() {
    await saveCloud();
    alert("保存しました");
  }

  function normalizeBossName(name: string) {
    const map: Record<string, string> = {
      "真・ヒルラ": "真ヒルラ",
      "真ヒルラ": "真ヒルラ",
      "スライム": "ガーディアンエンジェルスライム",
      "ガーディアンエンジェルスライム": "ガーディアンエンジェルスライム",
      "選ばれし者セレン": "セレン",
      "セレン": "セレン",
      "監視者カロス": "カロス",
      "カロス": "カロス",
      "カリーン": "カリーン",
      "暗黒の魔法使い": "暗黒の魔法使い",
      "スウ": "スウ",
      "デミアン": "デミアン",
      "ルシード": "ルシード",
      "ウィル": "ウィル",
      "ダスク": "ダスク",
      "デュンケル": "デュンケル",
      "リンボ": "リンボ",
      "バルドリックス": "バルドリックス",
      "最初の対敵者": "最初の対敵者",
      "アケチミツヒデ": "アケチミツヒデ",
      "ノウ姫": "ノウ姫",
      "ビシャスプラント": "ビシャス",
      "ビシャス": "ビシャス"
    };
    return map[name] || name;
  }

  function shouldClearBoss(analytics: string, mode: "safe" | "party") {
    if (!analytics) return false;
    if (["瞬殺可能", "ソロ余裕", "ソロ可能", "ソロ限界"].some((word) => analytics.includes(word))) return true;
    if (mode === "party" && analytics.includes("戦闘員")) return true;
    return false;
  }

  function importCharacterFromText() {
    if (!importText.trim()) {
      alert("キャラ情報を貼り付けてください");
      return;
    }

    try {
      const data = JSON.parse(importText);
      const name = data.name || data.characterName || "インポートキャラ";
      const level = data.basicStats?.level || "";
      const job = data.basicStats?.class || "";
      const power = data.apiResult?.power?.normal;
      const hexaPower = data.apiResult?.power?.hexa;
      const memoParts = [
        level ? `Lv${level}` : "",
        job ? `${job}` : "",
        power ? `戦闘力 ${Number(power).toLocaleString()}` : "",
        hexaPower ? `HEXA ${Number(hexaPower).toLocaleString()}` : ""
      ].filter(Boolean);
      const memo = memoParts.join(" / ");

      updateState((s) => {
        const character: Character = {
          id: uid(),
          name,
          memo,
          order: s.characters.length + 1
        };

        const newRuns: Run[] = s.bosses.filter((b) => b.cycle !== "日").map((boss) => ({
          id: uid(),
          characterId: character.id,
          bossId: boss.id,
          cleared: false,
          partySize: 1,
          overridePrice: "",
          memo: ""
        }));

        const bossResults = data.apiResult?.bossResults || {};
        const importCandidates: { boss: Boss; run: Run; analytics: string; partyLimit: number }[] = [];
        Object.values(bossResults).forEach((bossAny: any) => {
          const label = normalizeBossName(String(bossAny?.label || ""));
          const difficulties = bossAny?.difficulties || {};
          Object.values(difficulties).forEach((diffAny: any) => {
            const difficulty = String(diffAny?.summary?.difficulty || "");
            const analytics = String(diffAny?.analyticsSummary?.analytics || "");
            const partyLimit = Number(diffAny?.summary?.partyLimit || 1);
            const targetBoss = s.bosses.find((b) => b.name === label && b.difficulty === difficulty);
            if (!targetBoss) return;

            const targetRun = newRuns.find((r) => r.bossId === targetBoss.id);
            if (!targetRun) return;

            targetRun.memo = analytics || targetRun.memo;
            if (shouldClearBoss(analytics, importMode)) {
              importCandidates.push({ boss: targetBoss, run: targetRun, analytics, partyLimit });
            }
          });
        });

        const usedBossNames = new Set<string>();
        importCandidates
          .sort((a, b) => Number(b.boss.price || 0) - Number(a.boss.price || 0))
          .forEach((item) => {
            if (usedBossNames.has(item.boss.name)) return;
            if (newRuns.filter((r) => r.cleared).length >= (SELL_LIMIT + Math.max(0, Number(s.vipExtraSlots || 0)))) return;
            item.run.cleared = true;
            item.run.partySize = item.analytics.includes("戦闘員") ? Math.max(1, item.partyLimit || 1) : 1;
            item.run.memo = item.analytics;
            usedBossNames.add(item.boss.name);
          });

        return {
          ...s,
          characters: [...s.characters, character],
          runs: [...s.runs, ...newRuns],
          selectedCharacterId: character.id
        };
      });

      setImportText("");
      setTab("runs");
      alert(`${name} を登録しました`);
    } catch (error) {
      alert("読み込みに失敗しました。JSON全体をそのまま貼り付けてください。");
    }
  }


  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="gem">◇</span>
          <strong>ボス結晶管理</strong>
        </div>
        <div className="topActions">
          <span className="topChip">VIPランク：ロイヤル</span>
          <span className="topChip">リセット使用：3/3</span>
          {firebaseReady ? user ? (
            <>
              <button className="topButton" onClick={forceSave}><Save size={15} />{saving ? "保存中" : "保存"}</button>
              <button className="topButton" onClick={logout}><LogOut size={15} />ログアウト</button>
            </>
          ) : (
            <button className="topButton blue" onClick={loginWithGoogle}><LogIn size={15} />Googleで同期</button>
          ) : <span className="topChip warn">Firebase未設定</span>}
          <button className="topButton" onClick={resetWeek}><RotateCcw size={15} />週リセット</button>
        </div>
      </header>

      <section className="dashCards">
        <div className="revenueCard blueCard">
          <div className="revenueHead">
            <span>今週の予想収益</span>
            <em>クリックで内訳</em>
          </div>
          <div className="revenueValue">{yen(totalIncome)}</div>
          <div className="revenueSub">チェック済み：{totalCleared} 個</div>
        </div>
        <div className="revenueCard greenCard">
          <div className="revenueHead">
            <span>今週の確定収益</span>
            <em>売却対象のみ</em>
          </div>
          <div className="revenueValue">{yen(totalIncome)}</div>
          <div className="revenueSub">売却対象：{totalSold} / {state.characters.length * sellLimit}</div>
        </div>
        <div className="actionPanel">
          <button className="wideBlue" onClick={forceSave}>精算を実行する</button>
          <button className="widePale" onClick={resetWeek}>週リセット</button>
          <div className="syncLine">同期状態：{user ? (loadedCloud ? "ON" : "読込中") : "OFF"}</div>
        </div>
      </section>

      <nav className="topTabs">
        <button className={tab === "summary" ? "active" : ""} onClick={() => setTab("summary")}>チェックリスト</button>
        <button className={tab === "runs" ? "active" : ""} onClick={() => setTab("runs")}>回収設定</button>
        <button className={tab === "bosses" ? "active" : ""} onClick={() => setTab("bosses")}>統計</button>
        <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>設定</button>
      </nav>

      {tab === "summary" && (
        <main className="grid">
          {summary.map((row) => (
            <button key={row.character.id} className={`charCard ${row.character.id === selectedCharacter?.id ? "selected" : ""}`} onClick={() => { updateState((s) => ({ ...s, selectedCharacterId: row.character.id })); setTab("runs"); }}>
              <div className="charHeaderLine">
                <div>
                  <div className="avatar">{row.character.name.slice(0, 2)}</div>
                  <div className="charTop"><strong>{row.character.name}</strong><span className="statusTag">未設定</span></div>
                  <p>予想: {yen(row.income)}</p>
                </div>
                <span className={row.sold >= SELL_LIMIT ? "badge ok" : "badge"}>週: {row.sold}/{sellLimit}</span>
              </div>
              <div className="bossMiniGrid">
                <div className="miniTile"><b>売却対象</b><span>{row.sold} 個</span></div>
                <div className="miniTile"><b>チェック済み</b><span>{row.cleared} 個</span></div>
                <div className="miniTile"><b>残り枠</b><span>{Math.max(0, sellLimit - row.sold)} 個</span></div>
              </div>
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
            <span className="badge">選択 {enrichedRuns.filter((r) => r.characterId === selectedCharacter?.id && r.cleared).length}/{sellLimit}</span>
            <button className="primary" onClick={addRun}><Plus size={16} />追加</button>
          </div>
          <div className="runList">
            {shownRuns.map((r) => (
              <div key={r.id} className="runCard">
                <label className="check"><input type="checkbox" checked={r.cleared} disabled={!r.cleared && enrichedRuns.filter((x) => x.characterId === selectedCharacter?.id && x.cleared).length >= sellLimit} onChange={(e) => setRun(r.id, { cleared: e.target.checked })} /><strong>{bossLabel(r.boss)}</strong></label>
                <span className={r.cleared && sellSet.has(r.id) ? "badge sell" : "badge"}>{r.cleared && sellSet.has(r.id) ? "売却対象" : "除外"}</span>
                <select value={r.bossId} onChange={(e) => setRun(r.id, { bossId: e.target.value })}>
                  {state.bosses.map((b) => <option key={b.id} value={b.id} disabled={r.bossId !== b.id && enrichedRuns.some((x) => x.characterId === selectedCharacter?.id && x.id !== r.id && x.cleared && bossMap.get(x.bossId)?.name === b.name)}>{bossLabel(b)}</option>)}
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
          <section className="importBox">
            <div className="importHeader">
              <div>
                <h2>キャラ情報を貼り付け登録</h2>
                <p>戦闘力計算サイトなどから出力したJSONを貼ると、キャラ名・レベル・職業・戦闘力を自動登録し、ボス診断結果から討伐チェックも入れます。</p>
              </div>
              <span className="badge">瞬時登録</span>
            </div>
            <textarea
              placeholder='{"name":"卯月H師","basicStats":{"level":"290","class":"lynn"},"apiResult":{...}}'
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            <div className="toolbar">
              <label className="selectLabel">自動チェック範囲
                <select value={importMode} onChange={(e) => setImportMode(e.target.value as "safe" | "party")}>
                  <option value="safe">ソロ可能以上だけ</option>
                  <option value="party">戦闘員も含める</option>
                </select>
              </label>
              <button className="primary" onClick={importCharacterFromText}><Plus size={16} />貼り付け内容から登録</button>
            </div>
          </section>

          <div className="limitBox">
            <div>
              <h2>売却枠設定</h2>
              <p>通常12体に、VIP追加分を足した数まで選択できます。同じボスの別難易度は同時に選択できません。</p>
            </div>
            <label className="selectLabel">VIP追加枠
              <input type="number" min={0} max={20} value={state.vipExtraSlots || 0} onChange={(e) => updateState((s) => ({ ...s, vipExtraSlots: Math.max(0, Number(e.target.value || 0)) }))} />
            </label>
            <span className="badge">1キャラ {sellLimit} 体 / 合計 {state.characters.length * sellLimit} 体</span>
          </div>

          <div className="toolbar">
            <button className="primary" onClick={addCharacter}><Plus size={16} />空の結晶売却キャラを追加</button>
            <span className="badge">現在 {state.characters.length} キャラ / 売却枠 {state.characters.length * sellLimit} 個</span>
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
            貼り付け登録では、診断結果が「瞬殺可能」「ソロ余裕」「ソロ可能」「ソロ限界」のボスを討伐済みにします。<br />
            「戦闘員も含める」を選ぶと、戦闘員判定のボスもPT人数つきで討伐済みにします。<br />
            各キャラごとに選択できるボス数は「12 + VIP追加枠」までです。同じボスの別難易度は同時に選択できません。
          </div>
        </main>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
