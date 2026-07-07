import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Play, Pause, Star, Wallet, Music2, History, LogOut, CheckCircle2,
  Lock, ArrowRight, KeyRound, UserPlus, Copy, Check, Search, Target, CalendarClock,
} from "lucide-react";

// ---- acesso ---------------------------------------------------------------
const ENC_MASTER = "MTU5MDA=";
const isMaster = (v) => v.trim() === atob(ENC_MASTER);
const genCode = () => String(Math.floor(10000 + Math.random() * 90000));

// ---- regras do app ----------------------------------------------------------
const RATE_REWARD = 10;       // $ por avaliação
const DAILY_LIMIT = 10;       // avaliações por dia
const MIN_COMMENT = 50;       // caracteres mínimos no comentário
const WITHDRAW_GOAL = 50;     // meta de saldo para poder sacar
const MIN_DAYS = 10;          // dias mínimos de conta para poder sacar

const todayStr = () => new Date().toISOString().slice(0, 10);

// ---- motor de som -----------------------------------------------------------
// Nada de arquivos de áudio embutidos (que dependiam de um base64 gigante e
// não tocavam de forma confiável em todo navegador). Cada faixa agora é uma
// música curta GERADA NA HORA por osciladores do Web Audio API — sem
// nenhum arquivo, sem servidor, sem direitos de terceiros envolvidos, e com
// reprodução garantida porque quem "toca" o som é o próprio navegador do
// usuário, sintetizando notas em tempo real (como um instrumento).
const NOTE_FREQ = {
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00, A3: 220.00, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00,
};

// cada "estilo" define timbre (forma de onda), andamento e duas frases
// melódicas (verso e refrão) mais uma linha de baixo — tudo autoral,
// gerado por matemática simples, então não há questão de direitos autorais.
const STYLES = {
  upbeat: {
    wave: "square", bpm: 132,
    bass: ["C3", "C3", "G3", "G3", "A3", "A3", "F3", "F3"],
    verse: ["C4", "E4", "G4", "C5", "G4", "E4", "D4", "E4"],
    chorus: ["E4", "G4", "C5", "E5", "C5", "G4", "A4", "G4"],
  },
  moody: {
    wave: "sine", bpm: 86,
    bass: ["A3", "A3", "F3", "F3", "C3", "C3", "G3", "G3"],
    verse: ["A3", "C4", "E4", "A4", "E4", "C4", "D4", "C4"],
    chorus: ["F3", "A3", "C4", "F4", "C4", "A3", "G3", "A3"],
  },
  swing: {
    wave: "triangle", bpm: 104,
    bass: ["G3", "G3", "D3", "D3", "C3", "C3", "A3", "A3"],
    verse: ["G3", "B3", "D4", "G4", "D4", "B3", "A3", "B3"],
    chorus: ["D4", "F4", "A4", "D5", "A4", "F4", "G4", "F4"],
  },
  aggro: {
    wave: "sawtooth", bpm: 152,
    bass: ["E3", "E3", "B3", "B3", "G3", "G3", "D3", "D3"],
    verse: ["E4", "G4", "B4", "E5", "B4", "G4", "F4", "G4"],
    chorus: ["G4", "B4", "D5", "G5", "D5", "B4", "C5", "B4"],
  },
};

// ---- legendas sincronizadas ------------------------------------------------
// Como as faixas são instrumentais sintetizadas (não existem gravações reais
// nem letras oficiais para elas), cada estilo tem uma pequena letra ORIGINAL,
// escrita para este app, que acompanha a reprodução em forma de legenda —
// útil pra quem não consegue ouvir o áudio.
const LYRIC_BANKS = {
  upbeat: [
    "a luz de neon pisca e ninguém dorme",
    "o batimento sobe, ninguém segura",
    "essa cidade inteira dança comigo",
    "(refrão) solta o corpo, deixa ir",
    "(refrão) que a noite não tem pressa",
    "cada esquina guarda um som novo",
    "o relógio para quando a batida entra",
    "de novo essa vibração, de novo esse instante",
  ],
  moody: [
    "o silêncio pesa mais que a palavra",
    "guardei essa lembrança num canto qualquer",
    "a chuva lava o que ainda dói",
    "(refrão) fico aqui, só respirando",
    "(refrão) o tempo passa devagar",
    "as sombras contam o que eu não digo",
    "um acorde solto no meio do quarto",
    "essa saudade tem o meu tamanho",
  ],
  swing: [
    "o violão embala essa tarde mansa",
    "descalço no chão, sem pressa nenhuma",
    "o vento traz um cheiro de mato molhado",
    "(refrão) deixa balançar, devagar",
    "(refrão) que a vida é feita de detalhes",
    "um verso solto na varanda",
    "essa melodia cabe no meu bolso",
    "o sol se deita e a gente continua",
  ],
  aggro: [
    "o grave bate igual coração acelerado",
    "essa raiva vira som, vira grito",
    "ninguém segura esse tanto de energia",
    "(refrão) levanta e não recua",
    "(refrão) quebra tudo que te prende",
    "a guitarra corta o ar como lâmina",
    "esse impulso não cabe no peito",
    "de pé até o fim, sem desculpa",
  ],
};

// gira a letra-base do estilo pra cada faixa não começar sempre na mesma linha
function getLyricLines(song) {
  const bank = LYRIC_BANKS[song.style];
  const n = parseInt(song.id.slice(1), 10) || 0;
  const rot = n % bank.length;
  return [...bank.slice(rot), ...bank.slice(0, rot)];
}

const TRACK_DURATION = 60; // duração "virtual" de cada faixa no app
const CHORUS_OFFSETS = [20, 15, 25, 30, 10, 22, 18, 26, 20, 24];
const COVERS = ["🌆", "🌊", "☀️", "🔌", "🍃", "⚙️", "🌙", "🔥", "❄️", "🌸", "🌵", "🌀", "🎆", "🌫️", "⭐"];
const GENRES = ["Synthwave", "Indie Folk", "Pop", "Eletrônica", "MPB", "Rock", "Lo-fi", "Trap", "Bossa Nova", "Reggae", "Funk", "Samba", "Jazz", "Metal", "Punk"];
const TITLE_A = ["Noites de", "Luz de", "Eco de", "Sombra de", "Fogo em", "Chuva de", "Vento de", "Silêncio em", "Brilho de", "Deserto de", "Onda de", "Cristal de", "Poeira de", "Rastro de", "Farol de", "Névoa de", "Ritmo de", "Pulso de", "Aurora em", "Constelação de"];
const TITLE_B = ["Neon", "Vidro", "Concreto", "Papel", "Ferro", "Âmbar", "Grafite", "Marfim", "Cobre", "Sal", "Nuvem", "Espelho", "Pedra", "Fumaça", "Estrela", "Madeira", "Metal", "Cinza", "Ouro", "Prata", "Vento", "Chama", "Gelo", "Areia", "Lua"];
const ART_A = ["Vetor", "Zona", "Costa", "Máquina", "Rio", "Campo", "Círculo", "Vale", "Torre", "Ilha", "Bairro", "Praça", "Estação", "Distrito", "Litoral"];
const ART_B = ["Cromático", "Sul", "Cinza", "Lenta", "Solar", "Nórdico", "Elétrico", "Selvagem", "Urbano", "Profundo", "Lunar", "Noturno", "Errante", "Coletivo", "Central"];

// cada gênero usa um dos 4 estilos sonoros (o clima combina com o gênero)
const GENRE_STYLE = {
  Synthwave: "upbeat", Pop: "upbeat", Eletrônica: "upbeat", Funk: "upbeat",
  Rock: "moody", "Lo-fi": "moody", Jazz: "moody",
  "Indie Folk": "swing", MPB: "swing", "Bossa Nova": "swing", Reggae: "swing", Samba: "swing",
  Trap: "aggro", Metal: "aggro", Punk: "aggro",
};

function generateSongs() {
  const list = [];
  let idx = 0;
  for (let a = 0; a < TITLE_A.length; a++) {
    for (let b = 0; b < TITLE_B.length; b++) {
      const genre = GENRES[idx % GENRES.length];
      list.push({
        id: `g${idx}`,
        title: `${TITLE_A[a]} ${TITLE_B[b]}`,
        artist: `${ART_A[idx % ART_A.length]} ${ART_B[(idx * 3) % ART_B.length]}`,
        genre,
        cover: COVERS[idx % COVERS.length],
        style: GENRE_STYLE[genre],
        duration: TRACK_DURATION,
        chorusAt: CHORUS_OFFSETS[idx % CHORUS_OFFSETS.length],
      });
      idx++;
    }
  }
  return list;
}
const SONGS = generateSongs(); // 20 x 25 = 500 faixas

const fmtTime = (secs) => {
  if (!secs || !isFinite(secs) || secs < 0) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

// ---- CSS próprio (evita classes Tailwind arbitrárias, que não são
// compiladas neste ambiente e deixavam botões/cores sem efeito) ----
const CSS = `
  .mc-app { background:#000; color:#fff; min-height:100vh; width:100%; }
  .mc-muted { color:#B3B3B3; }
  .mc-faint { color:#535353; }
  .mc-panel { background:#181818; border:1px solid #282828; }
  .mc-panel-hover:hover { background:#232323; }
  .mc-input, .mc-textarea {
    background:#000; color:#fff; border:1px solid #282828; width:100%;
  }
  .mc-input:focus, .mc-textarea:focus { border-color:#1DB954; outline:none; }
  .mc-btn-primary {
    background:#1DB954; color:#000; font-weight:700; border:none; cursor:pointer;
    transition:background-color .15s ease, transform .1s ease;
  }
  .mc-btn-primary:hover:not(:disabled) { background:#1ed760; }
  .mc-btn-primary:active:not(:disabled) { transform:scale(0.98); }
  .mc-btn-primary:disabled { opacity:0.35; cursor:not-allowed; }
  .mc-btn-outline {
    background:transparent; color:#fff; border:1px solid #282828; cursor:pointer;
    transition:border-color .15s ease;
  }
  .mc-btn-outline:hover:not(:disabled) { border-color:#1DB954; }
  .mc-btn-outline:disabled { opacity:0.35; cursor:not-allowed; }
  .mc-btn-ghost { background:transparent; border:none; color:#B3B3B3; cursor:pointer; }
  .mc-btn-ghost:hover { color:#fff; }
  .mc-green-text { color:#1DB954; }
  .mc-green-border { border-color:#1DB954 !important; }
  .mc-header { background:rgba(0,0,0,0.95); backdrop-filter:blur(6px); border-bottom:1px solid #282828; }
  .mc-glowbox { animation:mc-pulse 3s ease-in-out infinite; }
  @keyframes mc-pulse {
    0%, 100% { box-shadow:0 0 30px rgba(29,185,84,0.35); }
    50% { box-shadow:0 0 55px rgba(29,185,84,0.6); }
  }
  .mc-blob { position:absolute; border-radius:9999px; filter:blur(80px); pointer-events:none; }
  .mc-code { letter-spacing:0.3em; }
  .mc-tab-active { border-bottom:2px solid #1DB954; color:#fff; }
  .mc-tab { border-bottom:2px solid transparent; color:#B3B3B3; cursor:pointer; background:none; }
  .mc-tab:hover { color:#fff; }
  .mc-star-on { fill:#1DB954; color:#1DB954; }
  .mc-star-off { color:#535353; }
  .mc-star-off:hover { color:#1DB954; }
  .mc-error { color:#f87171; }
  .mc-progress-track { background:#282828; border-radius:9999px; height:8px; overflow:hidden; }
  .mc-progress-fill { background:#1DB954; height:100%; transition:width .3s ease; }
  .mc-badge { background:#000; border:1px solid #282828; border-radius:9999px; padding:2px 10px; font-size:11px; }
  .mc-seek-track {
    position:relative; background:#4d4d4d; border-radius:9999px; height:4px; cursor:pointer;
  }
  .mc-seek-track:hover .mc-seek-fill { background:#1ed760; }
  .mc-seek-fill { background:#1DB954; height:100%; border-radius:9999px; position:relative; }
  .mc-seek-thumb {
    position:absolute; top:50%; width:12px; height:12px; border-radius:9999px; background:#fff;
    transform:translate(-50%, -50%); box-shadow:0 1px 3px rgba(0,0,0,0.5);
  }
  .mc-time { font-size:11px; color:#B3B3B3; font-variant-numeric:tabular-nums; }
  .mc-mode-btn { font-size:11px; padding:3px 9px; border-radius:9999px; border:1px solid #282828; background:transparent; color:#B3B3B3; cursor:pointer; }
  .mc-mode-btn:hover { border-color:#1DB954; color:#fff; }
  .mc-mode-btn-active { border-color:#1DB954; color:#1DB954; background:rgba(29,185,84,0.1); }
  .mc-yt-btn { font-size:11px; padding:3px 9px; border-radius:9999px; border:1px solid #282828; background:transparent; color:#B3B3B3; cursor:pointer; text-decoration:none; display:inline-flex; align-items:center; gap:4px; }
  .mc-yt-btn:hover { border-color:#FF0000; color:#fff; }
  .mc-lyrics { padding:10px 14px 14px; border-top:1px solid #282828; }
  .mc-lyric-line { font-size:12px; text-align:center; padding:2px 0; transition:color .2s ease, font-weight .2s ease; }
  .mc-lyric-dim { color:#535353; }
  .mc-lyric-current { color:#1DB954; font-weight:700; font-size:14px; }
`;

export default function MusiCash() {
  const [view, setView] = useState("landing");
  const [codeInput, setCodeInput] = useState("");
  const [pendingCode, setPendingCode] = useState("");
  const [pendingNome, setPendingNome] = useState("");
  const [pendingPhone, setPendingPhone] = useState("");
  const [authError, setAuthError] = useState("");
  const [authed, setAuthed] = useState(false);

  const [createForm, setCreateForm] = useState({ nome: "", telefone: "" });
  const [createdCode, setCreatedCode] = useState("");
  const [typedCode, setTypedCode] = useState(""); // código "digitando sozinho" após o cadastro
  const [copied, setCopied] = useState(false);

  const [tab, setTab] = useState("descobrir");
  const [balance, setBalance] = useState(0);
  const [ratings, setRatings] = useState({}); // { [songId]: {stars, comment, date} }
  const [withdrawals, setWithdrawals] = useState([]);
  const [createdAt, setCreatedAt] = useState(null);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [dailyDate, setDailyDate] = useState(todayStr());
  const [dailyCount, setDailyCount] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const [playingId, setPlayingId] = useState(null);
  const [playMode, setPlayMode] = useState({}); // { [songId]: "chorus" | "full" }
  const [progress, setProgress] = useState({}); // { [songId]: currentTimeSeconds }
  const [playError, setPlayError] = useState(""); // mensagem real de erro, se o navegador bloquear o áudio
  const [soundCheck, setSoundCheck] = useState(""); // resultado do teste de som isolado
  const seekTrackRefs = useRef({});

  // ---- motor de áudio: Web Audio API sintetizando notas em tempo real.
  // Não depende de nenhum arquivo de música — por isso funciona sempre e
  // não usa nada com direitos autorais de terceiros. ----
  const audioCtxRef = useRef(null);
  const activeNodesRef = useRef([]); // osciladores tocando agora, p/ poder parar
  const schedulerTimerRef = useRef(null);
  const nextNoteTimeRef = useRef(0);
  const noteIndexRef = useRef(0);
  const playingIdRef = useRef(null); // espelha playingId dentro do loop
  const playModeRef = useRef("full");
  const rafRef = useRef(null);
  const playStartWallRef = useRef(0);
  const playStartOffsetRef = useRef(0);

  const getAudioCtx = () => {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) throw new Error("Web Audio API indisponível neste navegador");
      audioCtxRef.current = new Ctx();
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  };

  const stopSound = useCallback(() => {
    if (schedulerTimerRef.current) {
      clearTimeout(schedulerTimerRef.current);
      schedulerTimerRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    activeNodesRef.current.forEach(({ osc, gain }) => {
      try { gain.gain.cancelScheduledValues(0); } catch (e) { /* já parado */ }
      try { osc.stop(); } catch (e) { /* já parado */ }
    });
    activeNodesRef.current = [];
    playingIdRef.current = null;
  }, []);

  // agenda uma nota (melodia + baixo) num instante exato do relógio de áudio
  const scheduleNote = (ctx, style, mode) => {
    const beat = 60 / style.bpm;
    const time = nextNoteTimeRef.current;
    const pattern = mode === "chorus" ? style.chorus : style.verse;
    const idx = noteIndexRef.current % pattern.length;
    const note = pattern[idx];
    const freq = NOTE_FREQ[note];

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = style.wave;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.14, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + beat * 0.92);
    osc.connect(gain).connect(ctx.destination);
    osc.start(time);
    osc.stop(time + beat);
    activeNodesRef.current.push({ osc, gain });
    osc.onended = () => {
      activeNodesRef.current = activeNodesRef.current.filter((n) => n.osc !== osc);
    };

    // linha de baixo, uma nota a cada dois tempos de melodia
    if (idx % 2 === 0) {
      const bassNote = style.bass[Math.floor(idx / 2) % style.bass.length];
      const bassFreq = NOTE_FREQ[bassNote] / 2;
      const bosc = ctx.createOscillator();
      const bgain = ctx.createGain();
      bosc.type = "sine";
      bosc.frequency.value = bassFreq;
      bgain.gain.setValueAtTime(0.0001, time);
      bgain.gain.linearRampToValueAtTime(0.11, time + 0.03);
      bgain.gain.exponentialRampToValueAtTime(0.0001, time + beat * 1.85);
      bosc.connect(bgain).connect(ctx.destination);
      bosc.start(time);
      bosc.stop(time + beat * 2);
      activeNodesRef.current.push({ osc: bosc, gain: bgain });
      bosc.onended = () => {
        activeNodesRef.current = activeNodesRef.current.filter((n) => n.osc !== bosc);
      };
    }

    noteIndexRef.current += 1;
    nextNoteTimeRef.current += beat;
  };

  // scheduler com "lookahead": agenda notas um pouco à frente do tempo real,
  // padrão recomendado para Web Audio (evita falhas de timing do JS)
  const runScheduler = (songId, style) => {
    if (playingIdRef.current !== songId) return;
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const scheduleAhead = 0.2;
    while (nextNoteTimeRef.current < ctx.currentTime + scheduleAhead) {
      scheduleNote(ctx, style, playModeRef.current);
    }
    schedulerTimerRef.current = setTimeout(() => runScheduler(songId, style), 50);
  };

  const playSong = useCallback((song, fromTime, mode) => {
    stopSound();
    setPlayError("");
    playingIdRef.current = song.id;
    playModeRef.current = mode;
    noteIndexRef.current = 0;

    // tenta iniciar o áudio, mas a legenda sincronizada abaixo funciona de
    // qualquer forma — assim quem não consegue ouvir ainda acompanha a faixa
    let ctx = null;
    try {
      ctx = getAudioCtx();
    } catch (err) {
      setPlayError(`Sem áudio disponível neste navegador (${err?.message || "erro desconhecido"}) — a legenda abaixo continua funcionando.`);
    }
    if (ctx) {
      const style = STYLES[song.style];
      nextNoteTimeRef.current = ctx.currentTime + 0.05;
      runScheduler(song.id, style);
    }

    playStartWallRef.current = performance.now();
    playStartOffsetRef.current = fromTime;
    setPlayingId(song.id);

    const tick = () => {
      if (playingIdRef.current !== song.id) return;
      const elapsed = playStartOffsetRef.current + (performance.now() - playStartWallRef.current) / 1000;
      if (elapsed >= song.duration) {
        stopSound();
        setPlayingId(null);
        setProgress((p2) => ({ ...p2, [song.id]: 0 }));
        return;
      }
      setProgress((p2) => ({ ...p2, [song.id]: elapsed }));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [stopSound]);

  // teste isolado: um bipe curto, só pra confirmar se o aparelho/navegador
  // consegue emitir som (não depende do catálogo de músicas)
  const runSoundCheck = () => {
    setSoundCheck("Tocando teste…");
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 440;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.02);
      gain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.45);
      setTimeout(() => {
        setSoundCheck(`Bipe disparado sem erros (contexto: ${ctx.state}). Se não ouviu nada, o problema é volume/mudo/modo silencioso no aparelho, não o app.`);
      }, 500);
    } catch (err) {
      setSoundCheck(`Erro ao tentar tocar som: ${err?.name || "erro"} — ${err?.message || "sem detalhes"}`);
    }
  };

  useEffect(() => {
    return () => {
      stopSound();
      if (audioCtxRef.current) {
        try { audioCtxRef.current.close(); } catch (e) { /* já fechado */ }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(20);
  const [expandedId, setExpandedId] = useState(null);
  const [draftStars, setDraftStars] = useState(0);
  const [draftComment, setDraftComment] = useState("");

  const [wForm, setWForm] = useState({ nome: "", telefone: "", valor: "" });
  const [wMsg, setWMsg] = useState("");
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  // ---- carregar estado pessoal (uma "gaveta" de dados por código de acesso) ----
  const stateKey = pendingCode ? `musicash:state:${pendingCode}` : null;

  useEffect(() => {
    if (!authed || !stateKey) return;
    setLoaded(false);
    (async () => {
      try {
        const res = await window.storage.get(stateKey, false);
        if (res?.value) {
          const data = JSON.parse(res.value);
          setBalance(data.balance ?? 0);
          setRatings(data.ratings ?? {});
          setWithdrawals(data.withdrawals ?? []);
          setCreatedAt(data.createdAt ?? new Date().toISOString());
          setNome(data.nome || pendingNome || "");
          setTelefone(data.telefone || pendingPhone || "");
          setDailyDate(data.dailyDate ?? todayStr());
          setDailyCount(data.dailyDate === todayStr() ? (data.dailyCount ?? 0) : 0);
        } else {
          setBalance(0);
          setRatings({});
          setWithdrawals([]);
          setCreatedAt(new Date().toISOString());
          setNome(pendingNome || "");
          setTelefone(pendingPhone || "");
          setDailyDate(todayStr());
          setDailyCount(0);
        }
      } catch (e) {
        setBalance(0);
        setRatings({});
        setWithdrawals([]);
        setCreatedAt(new Date().toISOString());
        setNome(pendingNome || "");
        setTelefone(pendingPhone || "");
        setDailyDate(todayStr());
        setDailyCount(0);
      } finally {
        setLoaded(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, stateKey]);

  const persist = useCallback(async (next) => {
    if (!stateKey) return;
    try {
      await window.storage.set(stateKey, JSON.stringify(next), false);
    } catch (e) {
      console.error("Falha ao salvar", e);
    }
  }, [stateKey]);

  useEffect(() => {
    if (!authed || !loaded || !stateKey) return;
    persist({ balance, ratings, withdrawals, createdAt, nome, telefone, dailyDate, dailyCount });
  }, [balance, ratings, withdrawals, createdAt, nome, telefone, dailyDate, dailyCount, authed, loaded, stateKey, persist]);

  useEffect(() => {
    if (!authed) {
      setWForm((f) => ({ ...f, nome: "", telefone: "" }));
    } else {
      setWForm((f) => ({ ...f, nome: nome || f.nome, telefone: telefone || f.telefone }));
    }
  }, [authed, nome, telefone]);

  // formata telefone como (11) 91234-5678 enquanto digita
  const formatPhone = (v) => {
    const digits = v.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  // ---- criar acesso ----
  const submitCreateStep1 = (e) => {
    e.preventDefault();
    const digits = createForm.telefone.replace(/\D/g, "");
    if (!createForm.nome.trim() || digits.length < 10) {
      setAuthError("Preencha nome e um telefone válido (com DDD).");
      return;
    }
    setAuthError("");
    setView("confirmarDados");
  };

  const confirmCreate = async () => {
    const code = genCode();
    try {
      let list = [];
      try {
        const res = await window.storage.get("musicash:accounts", true);
        if (res?.value) list = JSON.parse(res.value);
      } catch (e) {
        list = [];
      }
      list.push({ nome: createForm.nome, telefone: createForm.telefone, code });
      await window.storage.set("musicash:accounts", JSON.stringify(list), true);
    } catch (e) {
      console.error("Falha ao salvar conta (seguindo mesmo assim)", e);
    }
    setCreatedCode(code);
    setPendingCode(code);
    setPendingNome(createForm.nome);
    setPendingPhone(createForm.telefone);
    setAuthed(true);
    setView("app");
  };

  // ---- login ----
  const submitLogin = async (e) => {
    e.preventDefault();
    setAuthError("");
    if (!codeInput.trim()) {
      setAuthError("Digite um código.");
      return;
    }
    if (isMaster(codeInput)) {
      setPendingCode(codeInput.trim());
      setPendingNome("");
      setPendingPhone("");
      setView("confirm");
      return;
    }
    try {
      const res = await window.storage.get("musicash:accounts", true);
      const list = res?.value ? JSON.parse(res.value) : [];
      const found = list.find((a) => a.code === codeInput.trim());
      if (found) {
        setPendingCode(codeInput.trim());
        setPendingNome(found.nome || "");
        setPendingPhone(found.telefone || "");
        setView("confirm");
        return;
      }
    } catch (e) {
      // sem contas cadastradas ainda
    }
    setAuthError("Código inválido. Confira e tente novamente.");
  };

  const confirmAccess = () => {
    setAuthed(true);
    setView("app");
  };

  const handleLogout = () => {
    stopSound();
    setPlayingId(null);
    setAuthed(false);
    setLoaded(false);
    setCodeInput("");
    setPendingCode("");
    setPendingNome("");
    setPendingPhone("");
    setBalance(0);
    setRatings({});
    setWithdrawals([]);
    setCreatedAt(null);
    setNome("");
    setTelefone("");
    setDailyDate(todayStr());
    setDailyCount(0);
    setView("landing");
  };

  // ---- player ----
  const startPlayback = (song, mode) => {
    if (playingId === song.id && playMode[song.id] === mode) {
      stopSound();
      setPlayingId(null);
      return;
    }
    const fromTime = mode === "chorus" ? song.chorusAt : 0;
    setPlayMode((m) => ({ ...m, [song.id]: mode }));
    playSong(song, fromTime, mode);
  };

  const togglePlayPause = (song) => {
    if (playingId === song.id) {
      stopSound();
      setPlayingId(null);
      return;
    }
    const mode = playMode[song.id] || "full";
    setPlayMode((m) => ({ ...m, [song.id]: mode }));
    playSong(song, progress[song.id] || 0, mode);
  };

  const seekTo = (song, clientX) => {
    const track = seekTrackRefs.current[song.id];
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const newTime = ratio * song.duration;
    setProgress((p) => ({ ...p, [song.id]: newTime }));
    if (playingId === song.id) {
      playSong(song, newTime, playMode[song.id] || "full");
    }
  };

  const handleSeekDown = (song, e) => {
    e.preventDefault();
    seekTo(song, e.clientX);
    const onMove = (ev) => seekTo(song, ev.clientX);
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handleSeekTouch = (song, e) => {
    const touch = e.touches[0];
    if (touch) seekTo(song, touch.clientX);
  };

  // ---- avaliação (estrelas + comentário, com limite diário) ----
  const todayCount = dailyDate === todayStr() ? dailyCount : 0;
  const limitReached = todayCount >= DAILY_LIMIT;

  const openRating = (songId) => {
    if (ratings[songId] || limitReached) return;
    setExpandedId(songId);
    setDraftStars(0);
    setDraftComment("");
  };

  const cancelRating = () => {
    setExpandedId(null);
    setDraftStars(0);
    setDraftComment("");
  };

  const submitRating = (songId) => {
    if (limitReached || ratings[songId]) return;
    if (draftStars < 1) return;
    if (draftComment.trim().length < MIN_COMMENT) return;

    setRatings((r) => ({ ...r, [songId]: { stars: draftStars, comment: draftComment.trim(), date: new Date().toLocaleString("pt-BR") } }));
    setBalance((b) => b + RATE_REWARD);
    const today = todayStr();
    if (dailyDate === today) setDailyCount((c) => c + 1);
    else { setDailyDate(today); setDailyCount(1); }
    cancelRating();
  };

  // ---- saque ----
  const daysSinceCreation = createdAt ? Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000) : 0;
  const metaOk = balance >= WITHDRAW_GOAL;
  const daysOk = daysSinceCreation >= MIN_DAYS;
  const canWithdraw = metaOk && daysOk;

  const submitWithdraw = (e) => {
    e.preventDefault();
    if (!canWithdraw) return;
    const valor = Number(wForm.valor);
    const digits = wForm.telefone.replace(/\D/g, "");
    if (!wForm.nome.trim() || digits.length < 10 || !valor || valor <= 0) {
      setWMsg("Preencha nome, telefone e valor válidos.");
      return;
    }
    if (valor > balance) {
      setWMsg("Saldo insuficiente para esse saque.");
      return;
    }
    const novo = { id: Date.now(), nome: wForm.nome, telefone: wForm.telefone, valor, data: new Date().toLocaleString("pt-BR") };
    setWithdrawals((w) => [novo, ...w]);
    setBalance((b) => b - valor);
    setNome(wForm.nome);
    setTelefone(wForm.telefone);
    setWForm((f) => ({ ...f, valor: "" }));
    setWMsg("Saque solicitado com sucesso.");
    setTimeout(() => setWMsg(""), 3500);
  };

  const copyCode = () => {
    navigator.clipboard?.writeText(createdCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // o código aparece "digitando sozinho", letra por letra, assim que o
  // cadastro é concluído (efeito puramente visual, o valor real já existe)
  useEffect(() => {
    if (view !== "created" || !createdCode) return;
    setTypedCode("");
    let i = 0;
    const interval = setInterval(() => {
      i += 1;
      setTypedCode(createdCode.slice(0, i));
      if (i >= createdCode.length) clearInterval(interval);
    }, 220);
    return () => clearInterval(interval);
  }, [view, createdCode]);

  const filteredSongs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return SONGS;
    return SONGS.filter(
      (s) => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q) || s.genre.toLowerCase().includes(q)
    );
  }, [search]);

  const Style = () => <style>{CSS}</style>;

  // =========================================================================
  // LANDING
  // =========================================================================
  if (view === "landing") {
    return (
      <div className="mc-app flex flex-col items-center justify-center px-6 relative overflow-hidden">
        <Style />
        <div className="mc-blob" style={{ top: "-8rem", left: "-8rem", width: "24rem", height: "24rem", background: "rgba(29,185,84,0.20)" }} />
        <div className="mc-blob" style={{ bottom: "-8rem", right: "-8rem", width: "24rem", height: "24rem", background: "rgba(29,185,84,0.10)" }} />
        <div className="relative flex flex-col items-center text-center max-w-sm" style={{ zIndex: 1 }}>
          <div className="mc-glowbox w-20 h-20 rounded-3xl flex items-center justify-center mb-6" style={{ background: "#1DB954" }}>
            <Music2 color="#000" size={38} strokeWidth={2.5} />
          </div>
          <h1 className="text-4xl font-black tracking-tight">MusiCash</h1>
          <p className="mc-muted mt-3 leading-relaxed">
            Ouça cada faixa por completo, avalie e acompanhe seu saldo por avaliação.
          </p>
          <div className="w-full flex flex-col gap-3 mt-10">
            <button onClick={() => { setView("login"); setAuthError(""); }} className="mc-btn-primary w-full py-3.5 rounded-full flex items-center justify-center gap-2">
              <KeyRound size={18} /> Tenho um código de acesso
            </button>
            <button onClick={() => { setView("create"); setAuthError(""); }} className="mc-btn-outline w-full py-3.5 rounded-full flex items-center justify-center gap-2">
              <UserPlus size={18} /> Criar meu acesso
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // CRIAR ACESSO
  // =========================================================================
  if (view === "create") {
    return (
      <div className="mc-app flex items-center justify-center p-6">
        <Style />
        <div className="w-full max-w-sm">
          <button onClick={() => setView("landing")} className="mc-btn-ghost text-sm mb-6">← voltar</button>
          <h2 className="text-2xl font-black mb-1">Criar meu acesso</h2>
          <p className="mc-muted text-sm mb-6">Preencha seus dados para continuar.</p>
          <form onSubmit={submitCreateStep1} className="mc-panel rounded-xl p-6 space-y-4">
            <div>
              <label className="mc-muted block text-xs font-semibold uppercase tracking-wide mb-2">Nome</label>
              <input value={createForm.nome} onChange={(e) => setCreateForm((f) => ({ ...f, nome: e.target.value }))} className="mc-input px-4 py-3 rounded-lg" placeholder="Seu nome" />
            </div>
            <div>
              <label className="mc-muted block text-xs font-semibold uppercase tracking-wide mb-2">Telefone</label>
              <input
                type="tel"
                inputMode="tel"
                value={createForm.telefone}
                onChange={(e) => setCreateForm((f) => ({ ...f, telefone: formatPhone(e.target.value) }))}
                className="mc-input px-4 py-3 rounded-lg"
                placeholder="(11) 91234-5678"
              />
            </div>
            {authError && <p className="mc-error text-xs">{authError}</p>}
            <button type="submit" className="mc-btn-primary w-full py-3 rounded-full flex items-center justify-center gap-2">
              Confirmar <ArrowRight size={16} />
            </button>
          </form>
        </div>
      </div>
    );
  }

  // =========================================================================
  // CONFIRMAR DADOS
  // =========================================================================
  if (view === "confirmarDados") {
    return (
      <div className="mc-app flex items-center justify-center p-6">
        <Style />
        <div className="w-full max-w-sm">
          <button onClick={() => setView("create")} className="mc-btn-ghost text-sm mb-6">← voltar</button>
          <div className="flex flex-col items-center mb-6 text-center">
            <div className="mc-panel mc-green-border w-14 h-14 rounded-full flex items-center justify-center mb-4">
              <UserPlus className="mc-green-text" size={24} />
            </div>
            <h2 className="text-xl font-black">Confirme seus dados</h2>
          </div>
          <div className="mc-panel rounded-xl p-6 space-y-3 mb-6">
            <div><p className="mc-muted text-xs uppercase font-semibold">Nome</p><p className="font-semibold">{createForm.nome}</p></div>
            <div><p className="mc-muted text-xs uppercase font-semibold">Telefone</p><p className="font-semibold break-all">{createForm.telefone}</p></div>
          </div>
          <button onClick={confirmCreate} className="mc-btn-primary w-full py-3.5 rounded-full flex items-center justify-center gap-2 text-base">
            Confirmar e gerar acesso <ArrowRight size={18} />
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // CÓDIGO CRIADO
  // =========================================================================
  if (view === "created") {
    const stillTyping = typedCode.length < createdCode.length;
    return (
      <div className="mc-app flex items-center justify-center p-6">
        <Style />
        <div className="w-full max-w-sm text-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: "#1DB954" }}>
            <CheckCircle2 color="#000" size={30} />
          </div>
          <h2 className="text-xl font-black mb-2">Acesso criado</h2>
          <p className="mc-muted text-sm mb-6">Guarde este código. Ele é sua chave de entrada.</p>
          <div className="mc-panel mc-green-border rounded-xl py-5 flex items-center justify-center gap-3 mb-6">
            <span className="mc-code text-3xl font-black">
              {typedCode}
              {stillTyping && <span className="mc-cursor-blink">|</span>}
            </span>
            <button onClick={copyCode} disabled={stillTyping} className="mc-btn-ghost mc-green-text">{copied ? <Check size={20} /> : <Copy size={20} />}</button>
          </div>
          <button
            onClick={() => { setCodeInput(createdCode); setView("landing"); }}
            disabled={stillTyping}
            className="mc-btn-primary w-full py-3.5 rounded-full text-base"
          >
            Ir para o login
          </button>
          <p className="mc-faint text-xs mt-4">Código gerado nesta tela — guarde-o, ele não é enviado por SMS nem e-mail.</p>
        </div>
      </div>
    );
  }

  // =========================================================================
  // LOGIN
  // =========================================================================
  if (view === "login") {
    return (
      <div className="mc-app flex items-center justify-center p-6">
        <Style />
        <div className="w-full max-w-sm">
          <button onClick={() => setView("landing")} className="mc-btn-ghost text-sm mb-6">← voltar</button>
          <div className="flex flex-col items-center mb-6">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3" style={{ background: "#1DB954" }}>
              <Music2 color="#000" size={26} strokeWidth={2.5} />
            </div>
            <h1 className="text-xl font-black">Entrar no MusiCash</h1>
          </div>
          <form onSubmit={submitLogin} className="mc-panel rounded-xl p-6">
            <label className="mc-muted block text-xs font-semibold uppercase tracking-wide mb-2">Código de acesso</label>
            <div className="relative">
              <Lock className="mc-muted absolute left-3 top-1/2 -translate-y-1/2" size={16} />
              <input type="password" inputMode="numeric" autoFocus value={codeInput} onChange={(e) => setCodeInput(e.target.value)} placeholder="•••••" className="mc-input mc-code pl-10 pr-4 py-3 rounded-lg" />
            </div>
            {authError && <p className="mc-error text-xs mt-2">{authError}</p>}
            <button type="submit" className="mc-btn-primary w-full mt-5 py-3 rounded-full text-base">Continuar</button>
          </form>
        </div>
      </div>
    );
  }

  // =========================================================================
  // CONFIRMAÇÃO DE ACESSO
  // =========================================================================
  if (view === "confirm") {
    return (
      <div className="mc-app flex items-center justify-center p-6">
        <Style />
        <div className="w-full max-w-sm text-center">
          <div className="mc-panel mc-green-border w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5">
            <KeyRound className="mc-green-text" size={24} />
          </div>
          <h2 className="text-lg font-bold mb-1">Confirmar acesso</h2>
          <p className="mc-muted text-sm mb-5">
            Você está entrando com o código{" "}
            <span className="font-bold mc-code" style={{ color: "#fff" }}>{pendingCode.slice(0, 1)}•••{pendingCode.slice(-1)}</span>.
          </p>
          {(pendingNome || pendingPhone) && (
            <div className="mc-panel rounded-xl p-5 space-y-3 mb-6 text-left">
              <div><p className="mc-muted text-xs uppercase font-semibold">Nome</p><p className="font-semibold">{pendingNome || "—"}</p></div>
              <div><p className="mc-muted text-xs uppercase font-semibold">Telefone</p><p className="font-semibold break-all">{pendingPhone || "—"}</p></div>
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={() => setView("login")} className="mc-btn-outline flex-1 py-3 rounded-full font-semibold">Voltar</button>
            <button onClick={confirmAccess} className="mc-btn-primary flex-1 py-3 rounded-full text-base">Confirmar</button>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // APP PRINCIPAL
  // =========================================================================
  const ratedCount = Object.keys(ratings).length;

  return (
    <div className="mc-app flex flex-col">
      <Style />
      <header className="mc-header sticky top-0 z-10 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#1DB954" }}>
            <Music2 color="#000" size={18} strokeWidth={2.5} />
          </div>
          <span className="font-black tracking-tight">MusiCash</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="mc-badge mc-muted">{todayCount}/{DAILY_LIMIT} hoje</span>
          <div className="mc-panel flex items-center gap-1.5 rounded-full px-3 py-1.5">
            <Wallet size={14} className="mc-green-text" />
            <span className="font-bold text-sm">${balance}</span>
          </div>
          <button onClick={handleLogout} className="mc-btn-ghost"><LogOut size={18} /></button>
        </div>
      </header>

      <nav className="flex px-5 gap-6" style={{ borderBottom: "1px solid #282828" }}>
        {[
          { id: "descobrir", label: "Descobrir" },
          { id: "historico", label: "Minhas avaliações" },
          { id: "sacar", label: "Sacar" },
        ].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`py-3 text-sm font-semibold ${tab === t.id ? "mc-tab-active" : "mc-tab"}`}>
            {t.label}
          </button>
        ))}
      </nav>

      <main className="flex-1 px-5 py-6 max-w-2xl w-full mx-auto">
        {tab === "descobrir" && (
          <div>
            <p className="mc-muted text-sm mb-3">
              Ouça a faixa inteira ou pule direto para o refrão, dê de 1 a 5 estrelas e escreva pelo menos {MIN_COMMENT} caracteres sobre ela. Ganhe ${RATE_REWARD} por avaliação, até {DAILY_LIMIT} por dia.
            </p>
            <div className="mc-panel rounded-lg p-3 mb-4 text-sm flex items-center justify-between gap-3">
              <span className="mc-muted">Não sai som nenhum? Teste isolado, sem depender do catálogo:</span>
              <button onClick={runSoundCheck} className="mc-btn-outline text-xs px-3 py-1.5 rounded-full shrink-0">Testar som</button>
            </div>
            {soundCheck && <p className="mc-faint text-xs mb-4">{soundCheck}</p>}
            {playError && <p className="mc-error text-xs mb-4">{playError}</p>}
            {limitReached && (
              <div className="mc-panel rounded-lg p-3 mb-4 text-sm mc-error">
                Limite diário atingido ({DAILY_LIMIT}/{DAILY_LIMIT}). Volte amanhã para avaliar mais faixas.
              </div>
            )}
            <div className="relative mb-4">
              <Search className="mc-muted absolute left-3 top-1/2 -translate-y-1/2" size={16} />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setVisibleCount(20); }}
                placeholder="Buscar por título, artista ou gênero…"
                className="mc-input pl-10 pr-4 py-2.5 rounded-lg text-sm"
              />
            </div>

            <div className="space-y-3">
              {filteredSongs.slice(0, visibleCount).map((song) => {
                const already = ratings[song.id];
                const isPlaying = playingId === song.id;
                const isExpanded = expandedId === song.id;
                const current = progress[song.id] || 0;
                const pct = song.duration ? Math.min(100, (current / song.duration) * 100) : 0;
                const mode = playMode[song.id];

                return (
                  <div key={song.id} className="mc-panel rounded-xl overflow-hidden">
                    <div className="mc-panel-hover p-4 flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-black flex items-center justify-center text-2xl shrink-0">{song.cover}</div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{song.title}</p>
                        <p className="mc-muted text-xs truncate">{song.artist} · {song.genre}</p>
                        {already ? (
                          <span className="mc-green-text text-xs mt-1 inline-flex items-center gap-1">
                            <CheckCircle2 size={12} /> Avaliado — {already.stars}★ · +${RATE_REWARD}
                          </span>
                        ) : (
                          <button
                            onClick={() => openRating(song.id)}
                            disabled={limitReached}
                            className="mc-btn-outline text-xs mt-1.5 px-3 py-1 rounded-full"
                          >
                            Avaliar
                          </button>
                        )}
                      </div>
                      <div className="flex flex-col items-center gap-1 shrink-0">
                        <button
                          onClick={() => togglePlayPause(song)}
                          className="mc-btn-primary w-10 h-10 rounded-full flex items-center justify-center"
                          aria-label={isPlaying ? "Pausar" : "Ouvir música inteira"}
                        >
                          {isPlaying ? <Pause size={16} fill="black" /> : <Play size={16} fill="black" style={{ marginLeft: 2 }} />}
                        </button>
                      </div>
                    </div>

                    {/* mini player: barra de progresso + pular para o refrão */}
                    <div className="px-4 pb-3 flex items-center gap-3">
                      <span className="mc-time w-9 text-right">{fmtTime(current)}</span>
                      <div
                        ref={(el) => (seekTrackRefs.current[song.id] = el)}
                        className="mc-seek-track flex-1"
                        onMouseDown={(e) => handleSeekDown(song, e)}
                        onTouchStart={(e) => handleSeekTouch(song, e)}
                        onTouchMove={(e) => handleSeekTouch(song, e)}
                        role="slider"
                        aria-label={`Progresso de ${song.title}`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(pct)}
                      >
                        <div className="mc-seek-fill" style={{ width: `${pct}%` }}>
                          <div className="mc-seek-thumb" style={{ left: "100%" }} />
                        </div>
                      </div>
                      <span className="mc-time w-9">{fmtTime(song.duration)}</span>
                      <button
                        onClick={() => startPlayback(song, "chorus")}
                        className={`mc-mode-btn ${isPlaying && mode === "chorus" ? "mc-mode-btn-active" : ""}`}
                        title="Pular para o refrão"
                      >
                        Refrão
                      </button>
                      <a
                        href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${song.title} ${song.artist}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mc-yt-btn"
                        title="Buscar esse título no YouTube (faixa fictícia, gerada neste app — a busca pode não trazer resultado)"
                      >
                        ▶ YouTube
                      </a>
                    </div>

                    {isPlaying && (() => {
                      const lines = getLyricLines(song);
                      const lineIdx = Math.min(lines.length - 1, Math.floor((current / song.duration) * lines.length));
                      return (
                        <div className="mc-lyrics">
                          {lineIdx > 0 && <p className="mc-lyric-line mc-lyric-dim">{lines[lineIdx - 1]}</p>}
                          <p className="mc-lyric-line mc-lyric-current">{lines[lineIdx]}</p>
                          {lineIdx < lines.length - 1 && <p className="mc-lyric-line mc-lyric-dim">{lines[lineIdx + 1]}</p>}
                        </div>
                      );
                    })()}

                    {isExpanded && (
                      <div className="p-4 pt-0 space-y-3" style={{ borderTop: "1px solid #282828" }}>
                        <div className="flex items-center gap-1 pt-3">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button key={n} onClick={() => setDraftStars(n)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                              <Star size={22} className={n <= draftStars ? "mc-star-on" : "mc-star-off"} />
                            </button>
                          ))}
                        </div>
                        <textarea
                          value={draftComment}
                          onChange={(e) => setDraftComment(e.target.value)}
                          placeholder="O que você achou dessa faixa?"
                          rows={3}
                          className="mc-textarea rounded-lg px-3 py-2 text-sm"
                        />
                        <p className={`text-xs ${draftComment.trim().length >= MIN_COMMENT ? "mc-green-text" : "mc-faint"}`}>
                          {draftComment.trim().length}/{MIN_COMMENT} caracteres
                        </p>
                        <div className="flex gap-2">
                          <button onClick={cancelRating} className="mc-btn-outline flex-1 py-2 rounded-full text-sm">Cancelar</button>
                          <button
                            onClick={() => submitRating(song.id)}
                            disabled={draftStars < 1 || draftComment.trim().length < MIN_COMMENT}
                            className="mc-btn-primary flex-1 py-2 rounded-full text-sm"
                          >
                            Enviar avaliação
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {visibleCount < filteredSongs.length && (
              <button onClick={() => setVisibleCount((v) => v + 20)} className="mc-btn-outline w-full py-3 rounded-full mt-4 text-sm">
                Carregar mais ({filteredSongs.length - visibleCount} restantes)
              </button>
            )}
          </div>
        )}

        {tab === "historico" && (
          <div>
            <p className="mc-muted text-sm mb-4">{ratedCount} faixas avaliadas.</p>
            <div className="space-y-2">
              {Object.entries(ratings).map(([songId, r]) => {
                const song = SONGS.find((s) => s.id === songId);
                if (!song) return null;
                return (
                  <div key={songId} className="mc-panel rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{song.cover}</span>
                        <div>
                          <p className="text-sm font-semibold">{song.title}</p>
                          <p className="mc-muted text-xs">{song.artist}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="mc-green-text text-sm font-bold flex items-center gap-1"><Star size={12} className="mc-star-on" /> {r.stars}</span>
                        <span className="mc-muted text-xs">+${RATE_REWARD}</span>
                      </div>
                    </div>
                    <p className="mc-muted text-sm mt-2">{r.comment}</p>
                  </div>
                );
              })}
              {ratedCount === 0 && <p className="mc-faint text-sm text-center py-10">Nenhuma avaliação ainda. Vá em "Descobrir" e avalie uma faixa.</p>}
            </div>
          </div>
        )}

        {tab === "sacar" && (
          <div>
            <div className="mc-panel rounded-xl p-5 mb-4 flex items-center justify-between">
              <span className="mc-muted text-sm">Saldo disponível</span>
              <span className="mc-green-text text-2xl font-black">${balance}</span>
            </div>

            <div className="mc-panel rounded-xl p-5 mb-5 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="flex items-center gap-1.5 text-sm font-semibold"><Target size={14} className="mc-green-text" /> Meta para sacar</span>
                  <span className="mc-muted text-xs">${Math.min(balance, WITHDRAW_GOAL)}/${WITHDRAW_GOAL}</span>
                </div>
                <div className="mc-progress-track"><div className="mc-progress-fill" style={{ width: `${Math.min(100, (balance / WITHDRAW_GOAL) * 100)}%` }} /></div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="flex items-center gap-1.5 text-sm font-semibold"><CalendarClock size={14} className="mc-green-text" /> Tempo de conta</span>
                  <span className="mc-muted text-xs">{Math.min(daysSinceCreation, MIN_DAYS)}/{MIN_DAYS} dias</span>
                </div>
                <div className="mc-progress-track"><div className="mc-progress-fill" style={{ width: `${Math.min(100, (daysSinceCreation / MIN_DAYS) * 100)}%` }} /></div>
              </div>
            </div>

            {!canWithdraw && (
              <p className="mc-faint text-xs mb-4">
                {!metaOk && `Faltam $${WITHDRAW_GOAL - balance} para atingir a meta. `}
                {!daysOk && `Faltam ${MIN_DAYS - daysSinceCreation} dia(s) de conta.`}
              </p>
            )}

            <form onSubmit={submitWithdraw} className="mc-panel rounded-xl p-5 space-y-4">
              <div>
                <label className="mc-muted block text-xs font-semibold uppercase mb-1.5">Nome</label>
                <input
                  type="text"
                  value={wForm.nome}
                  onChange={(e) => setWForm((f) => ({ ...f, nome: e.target.value }))}
                  className="mc-input rounded-lg px-3 py-2.5 text-sm"
                  placeholder="Seu nome"
                  readOnly={!!nome}
                />
              </div>
              <div>
                <label className="mc-muted block text-xs font-semibold uppercase mb-1.5">Telefone</label>
                <input
                  type="tel"
                  inputMode="tel"
                  value={wForm.telefone}
                  onChange={(e) => setWForm((f) => ({ ...f, telefone: formatPhone(e.target.value) }))}
                  className="mc-input rounded-lg px-3 py-2.5 text-sm"
                  placeholder="(11) 91234-5678"
                  readOnly={!!telefone}
                />
              </div>
              <div>
                <label className="mc-muted block text-xs font-semibold uppercase mb-1.5">Valor ($)</label>
                <input type="number" min="1" value={wForm.valor} onChange={(e) => setWForm((f) => ({ ...f, valor: e.target.value }))} className="mc-input rounded-lg px-3 py-2.5 text-sm" placeholder="0" />
              </div>
              <button type="submit" disabled={!canWithdraw} className="mc-btn-primary w-full py-3 rounded-full">
                {canWithdraw ? "Solicitar saque" : "Requisitos não atingidos"}
              </button>
              {wMsg && <p className="mc-green-text text-sm text-center">{wMsg}</p>}
            </form>

            {withdrawals.length > 0 && (
              <div className="mt-6">
                <div className="mc-muted flex items-center gap-2 text-xs font-semibold uppercase mb-2"><History size={14} /> Histórico de saques</div>
                <div className="space-y-2">
                  {withdrawals.map((w) => (
                    <div key={w.id} className="mc-panel rounded-lg p-3 flex items-center justify-between text-sm">
                      <div>
                        <p className="font-semibold">{w.nome}</p>
                        <p className="mc-muted text-xs break-all">{w.telefone}</p>
                        <p className="mc-faint text-xs">{w.data}</p>
                      </div>
                      <span className="mc-green-text font-bold">-${w.valor}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 text-center max-w-md mx-auto">
              <p className="mc-faint text-xs leading-relaxed">
                MusiCash é um app feito para mostrar na prática um app de avaliação de músicas com recompensas.
                {showDisclaimer && (
                  <>
                    {" "}As faixas do catálogo são geradas ao vivo por um sintetizador simples rodando no seu navegador (nenhum arquivo de áudio, nenhum direito autoral de terceiros envolvido), e os nomes de artistas e títulos são todos fictícios. Os saques exibidos aqui não geram nenhuma transferência real de dinheiro, e os dados de saldo, avaliações e código de acesso ficam salvos apenas para fins de teste. Em resumo: o MusiCash usa moeda fictícia e não tem valor real.
                  </>
                )}
              </p>
              <button onClick={() => setShowDisclaimer((v) => !v)} className="mc-btn-ghost mc-green-text text-xs mt-1.5 underline">
                {showDisclaimer ? "Ler menos" : "Ler mais"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
