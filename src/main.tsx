import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { Coins, LogIn, LogOut, Plus, RotateCcw, Save, Settings, Trash2, Trophy } from "lucide-react";
import { auth, db, firebaseReady, loginWithGoogle, logout } from "./firebase";
import "./style.css";

type Character = { id: string; name: string; memo: string; order: number };
type Boss = { id: string; order: number; name: string; difficulty: string; cycle: string; price: number };
type Run = { id: string; characterId: string; bossId: string; cleared: boolean; vipReset?: boolean; partySize: number; overridePrice: string; memo: string };
type Settlement = { id: string; createdAt: number; totalIncome: number; totalCrystals: number; characterSummaries: { characterId: string; name: string; income: number; crystals: number; vip: number }[] };
type AppState = { characters: Character[]; bosses: Boss[]; runs: Run[]; selectedCharacterId: string; vipExtraSlots?: number; vipRank?: string; settlements?: Settlement[] };

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
        vipReset: false,
        partySize: 1,
        overridePrice: "",
        memo: "",
      }))
    ),
    selectedCharacterId: characters[0].id,
    vipExtraSlots: 0,
    vipRank: "royal_weekly",
    settlements: [],
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
  return { ...s, bosses, selectedCharacterId: s.selectedCharacterId || s.characters[0]?.id, vipExtraSlots: Number(s.vipExtraSlots || 0), vipRank: s.vipRank || "royal_weekly", settlements: s.settlements || [] };
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

  function shortDifficulty(difficulty?: string) {
    if (!difficulty) return "";
    if (difficulty === "Extreme") return "EX";
    if (difficulty === "Chaos") return "C";
    if (difficulty === "Hard") return "H";
    if (difficulty === "Normal") return "N";
    if (difficulty === "Easy") return "E";
    return difficulty;
  }

  function bossCardName(boss?: Boss) {
    if (!boss) return "未選択";
    return `${shortDifficulty(boss.difficulty)} ${boss.name}`;
  }

  const vipRankOptions = [
    { value: "none", label: "なし", resets: 0 },
    { value: "diamond_weekly", label: "ダイヤ（週1）", resets: 1 },
    { value: "platinum_weekly", label: "プラチナ（週2）", resets: 2 },
    { value: "royal_weekly", label: "ロイヤル（週3/月1）", resets: 3 },
    { value: "custom", label: "カスタム", resets: Math.max(0, Number(state.vipExtraSlots || 0)) },
  ];

  function getVipRankResetCount(rank = state.vipRank || "royal_weekly") {
    const found = vipRankOptions.find((x) => x.value === rank);
    return found ? found.resets : 0;
  }

  const vipLimit = getVipRankResetCount();
  const sellLimit = SELL_LIMIT + vipLimit;

  function isVipResetEligibleBoss(boss?: Boss) {
    if (!boss) return false;
    if (boss.difficulty === "Extreme") return false;
    const arcaneAndBefore = [
      "シグナス", "ヒルラ", "ピンクビーン", "ジャクム", "ピエール", "バンバン", "ブラッディクイーン",
      "マグナス", "ベルルム", "ノウ姫", "ビシャス", "アケチミツヒデ", "スウ", "デミアン",
      "ガーディアンエンジェルスライム", "ルシード", "ウィル", "ダスク", "デュンケル", "真ヒルラ",
      "暗黒の魔法使い"
    ];
    const authenticVip = ["セレン", "カロス", "カリーン"];
    return arcaneAndBefore.includes(boss.name) || authenticVip.includes(boss.name);
  }


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
  const totalVipReset = enrichedRuns.filter((r) => r.cleared && r.vipReset).length;

  const statRows = useMemo(() => {
    return state.characters
      .map((character) => {
        const selected = enrichedRuns.filter((r) => r.characterId === character.id && r.cleared);
        const income = selected.reduce((sum, r) => sum + r.share, 0);
        const vipCount = selected.filter((r) => r.vipReset).length;
        return { character, selectedCount: selected.length, vipCount, income };
      })
      .sort((a, b) => b.income - a.income);
  }, [state.characters, enrichedRuns]);

  const maxCharacterIncome = Math.max(1, ...statRows.map((r) => r.income));
  const estimatedMonth4 = totalIncome * 4;
  const estimatedMonth5 = totalIncome * 5;
  const totalVipReset = enrichedRuns.filter((r) => r.cleared && r.vipReset).length;

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

  function getVipCountForCharacter(runs: Run[], characterId: string) {
    return runs.filter((r) => r.characterId === characterId && r.cleared && r.vipReset).length;
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

  function toggleRunCleared(id: string) {
    const target = state.runs.find((r) => r.id === id);
    if (!target) return;
    setRun(id, { cleared: !target.cleared, vipReset: target.cleared ? false : target.vipReset });
  }

  function toggleVipReset(id: string) {
    const target = state.runs.find((r) => r.id === id);
    if (!target) return;
    const boss = bossMap.get(target.bossId);
    if (!isVipResetEligibleBoss(boss)) {
      alert("このボスはVIPリセット対象外です。対象はアーケインまでの非EXボス全部と、オーセンティックはセレン・カロス・カリーンの非EXまでです。EXは対象外です。");
      return;
    }
    if (!target.cleared) {
      alert("先にボスを選択してください。");
      return;
    }
    if (!target.vipReset && getVipCountForCharacter(state.runs, target.characterId) >= vipLimit) {
      alert(`VIPリセット枠は最大 ${vipLimit} 枠までです。上部のVIPランクから変更できます。`);
      return;
    }
    setRun(id, { vipReset: !target.vipReset });
  }

  function setRun(id: string, patch: Partial<Run>) {
    const target = state.runs.find((r) => r.id === id);
    if (!target) return;

    const wantsCheck = patch.cleared === true && !target.cleared;
    const wantsVip = patch.vipReset === true && !target.vipReset;
    const nextBossId = patch.bossId || target.bossId;
    const nextCleared = patch.cleared ?? target.cleared;
    const nextVipReset = patch.vipReset ?? target.vipReset;
    const nextBoss = bossMap.get(nextBossId);

    if (wantsCheck) {
      const currentCount = getCheckedCountForCharacter(state.runs, target.characterId);
      if (currentCount >= sellLimit) {
        alert(`このキャラは最大 ${sellLimit} 体まで選択できます。通常12体 + VIPリセット枠です。`);
        return;
      }
      if (hasSameBossChecked(state.runs, { ...target, bossId: nextBossId }, nextBossId)) {
        alert(`${nextBoss?.name || "同じボス"}は別難易度をすでに選択しています。同じボスは1難易度だけ選択できます。`);
        return;
      }
    }

    if (target.cleared && patch.bossId && hasSameBossChecked(state.runs, { ...target, bossId: patch.bossId }, patch.bossId)) {
      alert(`${nextBoss?.name || "同じボス"}は別難易度をすでに選択しています。同じボスは1難易度だけ選択できます。`);
      return;
    }

    if (nextVipReset) {
      if (!isVipResetEligibleBoss(nextBoss)) {
        alert("このボスはVIPリセット対象外です。対象はアーケインまでの非EXボス全部と、オーセンティックはセレン・カロス・カリーンの非EXまでです。EXは対象外です。");
        return;
      }
      if (!nextCleared) {
        alert("VIPリセットを使う場合は、先にボスを選択してください。");
        return;
      }
      if (wantsVip && getVipCountForCharacter(state.runs, target.characterId) >= vipLimit) {
        alert(`VIPリセット枠は最大 ${vipLimit} 枠までです。`);
        return;
      }
    }

    updateState((s) => ({ ...s, runs: s.runs.map((r) => r.id === id ? { ...r, ...patch, vipReset: nextCleared ? nextVipReset : false } : r) }));
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
      const runs = s.bosses.filter((b) => b.cycle !== "日").map((b) => ({ id: uid(), characterId: c.id, bossId: b.id, cleared: false, vipReset: false, partySize: 1, overridePrice: "", memo: "" }));
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
    updateState((s) => ({ ...s, runs: [...s.runs, { id: uid(), characterId: selectedCharacter.id, bossId: boss.id, cleared: false, vipReset: false, partySize: 1, overridePrice: "", memo: "" }] }));
  }

  function resetWeek() {
    if (!confirm("全キャラの討伐チェックを外しますか？")) return;
    updateState((s) => ({ ...s, runs: s.runs.map((r) => ({ ...r, cleared: false, vipReset: false })) }));
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

  function settleNow() {
    const rows = state.characters.map((character) => {
      const selected = enrichedRuns.filter((r) => r.characterId === character.id && r.cleared);
      return {
        characterId: character.id,
        name: character.name,
        income: selected.reduce((sum, r) => sum + r.share, 0),
        crystals: selected.length,
        vip: selected.filter((r) => r.vipReset).length,
      };
    }).filter((row) => row.crystals > 0);

    if (rows.length === 0) {
      alert("精算する結晶がありません。");
      return;
    }

    const settlement: Settlement = {
      id: uid(),
      createdAt: Date.now(),
      totalIncome: rows.reduce((sum, row) => sum + row.income, 0),
      totalCrystals: rows.reduce((sum, row) => sum + row.crystals, 0),
      characterSummaries: rows,
    };

    updateState((s) => ({ ...s, settlements: [settlement, ...(s.settlements || [])].slice(0, 50) }));
    alert(`精算履歴を保存しました：${yen(settlement.totalIncome)}`);
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
          <select className="vipRankSelect" value={state.vipRank || "royal_weekly"} onChange={(e) => updateState((s) => ({ ...s, vipRank: e.target.value, vipExtraSlots: e.target.value === "custom" ? s.vipExtraSlots : getVipRankResetCount(e.target.value) }))}>
            {vipRankOptions.map((rank) => <option key={rank.value} value={rank.value}>VIPランク：{rank.label}</option>)}
          </select>
          <span className="topChip">リセット使用：{totalVipReset}/{vipLimit}</span>
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
          <div className="revenueSub">売却対象：{totalSold} / {state.characters.length * sellLimit}　VIP：{totalVipReset}</div>
        </div>
        <div className="actionPanel">
          <button className="wideBlue" onClick={settleNow}>精算を実行する</button>
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
        <main className="checkLayout">
          <aside className="charSidebar">
            {state.characters.map((c) => {
              const checked = enrichedRuns.filter((r) => r.characterId === c.id && r.cleared).length;
              const vip = enrichedRuns.filter((r) => r.characterId === c.id && r.cleared && r.vipReset).length;
              return (
                <button
                  key={c.id}
                  className={`sideChar ${c.id === selectedCharacter?.id ? "active" : ""}`}
                  onClick={() => updateState((s) => ({ ...s, selectedCharacterId: c.id }))}
                >
                  <span className="sideAvatar">{c.name.slice(0, 2)}</span>
                  <span>
                    <b>{c.name}</b>
                    <em>{checked}体選択中 / VIP {vip}/{vipLimit}</em>
                  </span>
                </button>
              );
            })}
          </aside>

          <section className="bossPicker">
            <div className="pickerHeader">
              <div>
                <h2>{selectedCharacter?.name}</h2>
                <p>ボスカードをクリックで選択。人数はカード内で変更できます。同じボスは1難易度だけ選択可能。</p>
              </div>
              <div className="pickerActions">
                <span className="badge">選択 {enrichedRuns.filter((r) => r.characterId === selectedCharacter?.id && r.cleared).length}/{sellLimit}</span>
                <span className="badge vipBadge">VIP {enrichedRuns.filter((r) => r.characterId === selectedCharacter?.id && r.cleared && r.vipReset).length}/{vipLimit}</span>
                <input className="pickerSearch" placeholder="ボス検索" value={search} onChange={(e) => setSearch(e.target.value)} />
                <button onClick={() => {
                  const candidates = enrichedRuns
                    .filter((r) => r.characterId === selectedCharacter?.id)
                    .sort((a, b) => Number(b.boss?.price || 0) - Number(a.boss?.price || 0));
                  const used = new Set<string>();
                  const ids = new Set<string>();
                  candidates.forEach((r) => {
                    const name = r.boss?.name || "";
                    if (ids.size >= sellLimit || used.has(name)) return;
                    used.add(name);
                    ids.add(r.id);
                  });
                  updateState((s) => ({...s, runs: s.runs.map((r) => r.characterId === selectedCharacter?.id ? {...r, cleared: ids.has(r.id), vipReset:false} : r)}));
                }}>全選択</button>
                <button onClick={() => updateState((s) => ({...s, runs: s.runs.map((r) => r.characterId === selectedCharacter?.id ? {...r, cleared:false, vipReset:false} : r)}))}>全解除</button>
              </div>
            </div>

            <div className="weeklyTitle">● WEEKLY / MONTHLY BOSSES</div>
            <div className="bossCardGrid">
              {shownRuns.map((r) => {
                const sameBossSelected = enrichedRuns.some((x) => x.characterId === selectedCharacter?.id && x.id !== r.id && x.cleared && bossMap.get(x.bossId)?.name === r.boss?.name);
                const maxed = !r.cleared && enrichedRuns.filter((x) => x.characterId === selectedCharacter?.id && x.cleared).length >= sellLimit;
                const vipEligible = isVipResetEligibleBoss(r.boss);
                return (
                  <div
                    key={r.id}
                    className={`selectBossCard ${r.cleared ? "checked" : ""} ${r.vipReset ? "vipSelected" : ""} ${sameBossSelected ? "disabledBySame" : ""}`}
                    onClick={() => !sameBossSelected && !maxed && toggleRunCleared(r.id)}
                  >
                    <div className="bossCardTop">
                      <span className={`fakeCheck ${r.cleared ? "on" : ""}`}>{r.cleared ? "✓" : ""}</span>
                      <div className="bossTitleWrap">
                        <strong>{bossCardName(r.boss)}</strong>
                        <em>{yen(r.share)}</em>
                      </div>
                      {vipEligible && (
                        <button
                          className={`vipToggle ${r.vipReset ? "on" : ""}`}
                          onClick={(e) => { e.stopPropagation(); toggleVipReset(r.id); }}
                          title="VIPリセット"
                        >
                          ♕ VIP
                        </button>
                      )}
                    </div>
                    <div className="partyLine" onClick={(e) => e.stopPropagation()}>
                      <span>人数</span>
                      <select value={r.partySize} onChange={(e) => setRun(r.id, { partySize: Math.max(1, Number(e.target.value || 1)) })}>
                        {[1,2,3,4,5,6].map((n) => <option key={n} value={n}>{n}人</option>)}
                      </select>
                    </div>
                    {sameBossSelected && <div className="cardNote">同ボス選択済み</div>}
                    {maxed && !r.cleared && <div className="cardNote">上限</div>}
                  </div>
                );
              })}
            </div>
          </section>
        </main>
      )}

      {tab === "bosses" && (
        <main className="reportPage">
          <div className="reportPageTitle">
            <span className="hamburger">☰</span>
            <h2>統計レポート</h2>
          </div>

          <section className="reportHero">
            <div className="reportFilters">
              <div className="quickShow">
                <span>クイック表示：</span>
                <button className="active">全表示</button>
                <button>今週</button>
                <button>今月</button>
                <button>全キャラ</button>
              </div>

              <div className="filterGrid">
                <label>開始週
                  <select>
                    <option>現在の選択内容</option>
                  </select>
                </label>
                <label>終了週
                  <select>
                    <option>現在の選択内容</option>
                  </select>
                </label>
                <label>サーバー
                  <select>
                    <option>全てのサーバー</option>
                  </select>
                </label>
                <label>キャラクター
                  <select>
                    <option>全てのキャラクター</option>
                    {state.characters.map((c) => <option key={c.id}>{c.name}</option>)}
                  </select>
                </label>
              </div>
            </div>

            <div className="totalReportBox">
              <span>選択中の合計収益</span>
              <strong>{yen(totalIncome)}</strong>
              <em>({Math.round(totalIncome).toLocaleString()} メル)</em>
              <div className="reportPills">
                <b>全期間</b>
                <b>全キャラ</b>
                <b>{totalSold} 個</b>
              </div>
            </div>
          </section>

          <h3 className="reportSectionTitle">キャラクター別収支</h3>
          <section className="characterRevenueGrid">
            {statRows.map((row, index) => (
              <div className="characterRevenueCard" key={row.character.id}>
                <div className="revenueRank">{index + 1}</div>
                <div className="revenueAvatar">{row.character.name.slice(0, 2)}</div>
                <div className="revenueInfo">
                  <div className="revenueName">
                    <b>{row.character.name}</b>
                    <span>未設定</span>
                  </div>
                  <div className="revenueBar">
                    <i style={{ width: `${Math.max(2, (row.income / maxCharacterIncome) * 100)}%` }} />
                  </div>
                </div>
                <div className="revenueMoney">{yen(row.income)}</div>
              </div>
            ))}
          </section>

          <section className="monthlyPanel">
            <div className="monthlyHeader">
              <h3>月別収支（メインル週基準）</h3>
              <div className="legend">
                <span><i className="greenDot" /> 精算済</span>
                <span><i className="yellowDot" /> 一部未精算</span>
                <span><i className="redDot" /> 未精算</span>
                <span><i className="grayDot" /> 予定</span>
              </div>
            </div>

            <div className="monthCards">
              <div className="monthReportCard muted">
                <div className="monthBadge">今週</div>
                <div>
                  <b>現在選択</b>
                  <small>{totalSold}個の結晶</small>
                </div>
                <strong>{yen(totalIncome)}</strong>
                <div className="weekDots"><i /><i /><i /><i /></div>
              </div>
              <div className="monthReportCard">
                <div className="monthBadge orange">4週分</div>
                <div>
                  <b>4週換算</b>
                  <small>現在の選択 × 4</small>
                </div>
                <strong>{yen(estimatedMonth4)}</strong>
                <div className="weekDots yellow"><i /><i /><i /><i /></div>
              </div>
              <div className="monthReportCard">
                <div className="monthBadge orange">5週分</div>
                <div>
                  <b>5週換算</b>
                  <small>現在の選択 × 5</small>
                </div>
                <strong>{yen(estimatedMonth5)}</strong>
                <div className="weekDots yellow"><i /><i /><i /><i /><i /></div>
              </div>
            </div>
          </section>

          <section className="settlementHistory">
            <h3>期間内の精算履歴</h3>
            {(state.settlements || []).length === 0 ? (
              <div className="emptyHistory">
                まだ精算履歴がありません。上部の「精算を実行する」を押すと、現在選択中の内容が履歴に残ります。
              </div>
            ) : (
              <div className="historyRows">
                {(state.settlements || []).map((settlement) => (
                  <div className="settlementRow" key={settlement.id}>
                    <div className="settlementIcon">◷</div>
                    <div className="settlementMain">
                      <b>{formatDateTime(settlement.createdAt)}</b>
                      <span>
                        {settlement.characterSummaries.map((c) => c.name).join("、")} ・ {settlement.totalCrystals}個の結晶
                      </span>
                    </div>
                    <div className="settlementIncome">
                      <small>収益</small>
                      <strong>{yen(settlement.totalIncome)}</strong>
                    </div>
                    <button className="deleteSettlement" onClick={() => updateState((s) => ({ ...s, settlements: (s.settlements || []).filter((x) => x.id !== settlement.id) }))}>削除</button>
                  </div>
                ))}
              </div>
            )}
          </section>
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
              <p>通常12体にVIP追加枠を足した数まで選択できます。VIPリセット対象は、アーケインまでのボス全部とセレン・カロス・カリーンまでです。同じボスの別難易度は同時に選択できません。</p>
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
