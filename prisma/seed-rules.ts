// 自然拼读规则种子数据 L0~L8（60 条）
// 格式: [code, level, name, pattern, description, tip, examples]

export type SeedRule = [string, number, string, string, string, string, string[]];

export const RULES: SeedRule[] = [
  // ===== L0 字母认知 =====
  ["L0-LETTER-SOUND", 0, "字母音 vs 字母名", "", "26 个字母都有两个名字：字母名（如 B 读 /biː/）和字母音（B 在单词里读 /b/）。自然拼读用的是「字母音」。初学者最大的混淆就是把字母名当字母音来拼单词。", "记住：拼读时说「音」不说「名」。B 的音是 /b/ 不是 /biː/。", ["ant", "bed", "cat", "dog", "egg"]],

  // ===== L1 单字母 + CVC =====
  ["L1-SHORT-A", 1, "短元音 a → /æ/", "a", "a 在闭音节（辅+元+辅）中读短音 /æ/，嘴巴张大像被小苹果咬一口。", "a 张大嘴：apple 苹果音。cat /k/-/æ/-/t/ → cat！", ["cat", "hat", "map", "bag", "hand", "ant"]],
  ["L1-SHORT-E", 1, "短元音 e → /e/", "e", "e 在闭音节中读短音 /e/，嘴巴半开。", "e 像小企鹅张嘴：egg。bed /b/-/e/-/d/ → bed！", ["bed", "pen", "ten", "leg", "nest", "egg"]],
  ["L1-SHORT-I", 1, "短元音 i → /ɪ/", "i", "i 在闭音节中读短音 /ɪ/，短促轻快，不是字母名 /aɪ/！", "i 短促一笑：/ɪ/！pig /p/-/ɪ/-/g/ → pig！", ["pig", "sit", "big", "six", "hit", "lip"]],
  ["L1-SHORT-O", 1, "短元音 o → /ɒ/", "o", "o 在闭音节中读短音 /ɒ/，圆嘴短促。", "o 圆嘴惊讶：/ɒ/！dog /d/-/ɒ/-/g/ → dog！", ["dog", "hot", "box", "top", "mop"]],
  ["L1-SHORT-U", 1, "短元音 u → /ʌ/", "u", "u 在闭音节中读短音 /ʌ/，嘴巴放松。", "u 放松音：/ʌ/～sun /s/-/ʌ/-/n/ → sun！", ["sun", "cup", "run", "bus", "nut"]],
  ["L1-CVC-BLENDING", 1, "CVC 拼读 Blending", "CVC", "辅音+元音+辅音叫 CVC 词。核心动作是「拼读」：把音素连起来读，不是一个个单独读！/k/-/æ/-/t/ 快速连读 → cat。", "像小火车连车厢：/k/-/æ/-/t/ → cat，越连越快！", ["cat", "dog", "pen", "sun", "pig"]],

  // ===== L2 魔法 E =====
  ["L2-MAGIC-E-A", 2, "魔法E: a_e → /eɪ/", "a_e", "词尾的 e 不发音，但它像魔法棒一样让前面的 a 读自己的字母名 /eɪ/！cap → cape。", "安静的小 e 有魔法：把 a 变成 /eɪ/！cake 不是 /kæk/ 是 /keɪk/", ["cake", "name", "game", "plane", "date"]],
  ["L2-MAGIC-E-I", 2, "魔法E: i_e → /aɪ/", "i_e", "魔法 e 让 i 读字母名 /aɪ/！kit → kite，sit → site。", "小 e 一挥手，i 就长成 /aɪ/！bike /b/-/aɪ/-/k/", ["bike", "five", "time", "kite", "nine"]],
  ["L2-MAGIC-E-O", 2, "魔法E: o_e → /əʊ/", "o_e", "魔法 e 让 o 读字母名 /əʊ/！not → note，hop → hope。", "hop 加 e 变 hope：/hɒp/ → /həʊp/", ["home", "note", "nose", "rose", "bone"]],
  ["L2-MAGIC-E-U", 2, "魔法E: u_e → /juː/ 或 /uː/", "u_e", "魔法 e 让 u 读 /juː/（如 cute）或 /uː/（如 June）。", "cube /kjuːb/，june /dʒuːn/——u_e 有两种读法哦", ["cube", "cute", "tube", "use", "june"]],
  ["L2-MAGIC-E-E", 2, "魔法E: e_e → /iː/", "e_e", "魔法 e 让 e 读 /iː/，如 these。较少见。", "these 里的 e_e 读 /iː/", ["these"]],

  // ===== L3 辅音字母组合 =====
  ["L3-CH", 3, "ch → /tʃ/", "ch", "两个字母手拉手只发一个音！ch 读 /tʃ/（火车音）。这是 digraph（两字母一音），不是 blend。", "ch 是「火车启动」音：choo choo！chair", ["chair", "cheese", "lunch", "teach"]],
  ["L3-SH", 3, "sh → /ʃ/", "sh", "sh 读 /ʃ/（请安静音），永远不读 /s/-/h/ 两个音。", "sh～请安静！ship 不是 s-h-i-p 三段，是 /ʃ/-/ɪ/-/p/", ["ship", "shop", "fish", "dish", "wash"]],
  ["L3-TH", 3, "th → /θ/（清音）", "th", "th 舌尖轻轻咬住读 /θ/（清音），如 think。注意别读成 /s/！", "舌尖伸出来轻轻咬：/θ/～three", ["think", "three", "mouth", "bath"]],
  ["L3-TH-VOICED", 3, "th → /ð/（浊音）", "th", "th 在常用词（代词、the、家人）里读浊音 /ð/，声带振动。", "this/that/the/mother 里的 th 会「嗡嗡」响：/ð/", ["this", "that", "mother", "father"]],
  ["L3-PH", 3, "ph → /f/", "ph", "ph 来自希腊语，读 /f/，和 f 一模一样。", "ph 就是 f 的化名：phone = f-one", ["phone", "photo", "elephant"]],
  ["L3-CK", 3, "ck → /k/", "ck", "短元音后面的 /k/ 音词尾要写 ck，不是 c 也不是 k。只发一个 /k/ 音。", "短元音的好朋友是 ck：duck、back、clock", ["duck", "back", "clock", "black"]],
  ["L3-QU", 3, "qu → /kw/", "qu", "q 总是和 u 手拉手出现，一起读 /kw/。", "q 不单独出现，一定带 u：queen /kw/-/iː/-/n/", ["queen", "quick", "quite"]],
  ["L3-NG", 3, "ng → /ŋ/", "ng", "ng 读后鼻音 /ŋ/，舌根抬高，气从鼻子出。", "唱歌的尾音：sing～/sɪŋ/", ["sing", "king", "ring", "long", "wing"]],

  // ===== L4 元音字母组合 =====
  ["L4-AI", 4, "ai / ay → /eɪ/", "ai|ay", "ai 用在词中（rain），ay 用在词尾（day），都读 /eɪ/。别写成 rane！", "ai 在中间，ay 在末尾，都是字母名 A 的音", ["rain", "train", "day", "play", "say"]],
  ["L4-EE", 4, "ee / ea → /iː/", "ee|ea", "ee 和 ea 都读长音 /iː/（微笑音）。see/sea 同音不同形！", "微笑长音 /iː/～see 和 sea 听起来一样哦", ["see", "tree", "sea", "tea", "eat"]],
  ["L4-OA", 4, "oa / ow → /əʊ/", "oa|ow", "oa 在词中（boat），ow 在词尾（snow）或 n/l 前（window），读 /əʊ/。", "boat、snow、window 都是 /əʊ/", ["boat", "coat", "road", "snow", "window"]],
  ["L4-OO-LONG", 4, "oo → /uː/（长音）", "oo", "oo 常读长音 /uː/（嘴巴撅圆），如 moon、food。ue/ew 也读 /uː/（blue）。", "撅圆嘴拉长音：moon～/muːn/", ["moon", "food", "zoo", "school", "blue"]],
  ["L4-OO-SHORT", 4, "oo → /ʊ/（短音）", "oo", "oo 在 k/d/t 前常读短音 /ʊ/，如 book、good、foot。", "k 前的 oo 短一截：book /bʊk/", ["book", "look", "good", "foot"]],
  ["L4-IGH", 4, "igh → /aɪ/", "igh", "igh 三兄弟手拉手只读 /aɪ/，gh 完全不发音！", "gh 是哑巴：night /n-aɪ-t/ 只有三个音", ["night", "light", "right", "high"]],
  ["L4-OI", 4, "oi / oy → /ɔɪ/", "oi|oy", "oi 用在词中（coin），oy 用在词尾（boy），读 /ɔɪ/。", "oi～oy～都是「偶伊」音", ["oil", "coin", "boy", "toy"]],
  ["L4-OU", 4, "ou / ow → /aʊ/", "ou|ow", "ou/ow 的另一套读音是 /aʊ/（被咬音）：cloud、cow。注意 ow 有两个音：snow 是 /əʊ/，cow 是 /aʊ/。", "cow 和 snow 的 ow 读音不同哦！cow /kaʊ/", ["cloud", "house", "cow", "down", "flower"]],

  // ===== L5 R 控制元音 =====
  ["L5-AR", 5, "ar → /ɑː/", "ar", "元音 a 被 r「绑架」后读 /ɑː/（医生压舌音），不再读短音。", "ar～张大嘴被检查：car /kɑː/", ["car", "star", "farm", "park", "arm"]],
  ["L5-OR", 5, "or / oor / al → /ɔː/", "or|oor|al", "or 被 r 控制读 /ɔː/（圆嘴音）。oor（door）和词中的 all（ball、small）也读 /ɔː/。", "for、door、ball 都是圆嘴 /ɔː/", ["fork", "horse", "short", "door", "ball"]],
  ["L5-ER", 5, "er / ir / ur → /ɜː/", "er|ir|ur", "er、ir、ur 被 r 控制后读音完全一样，都是 /ɜː/（卷舌音）！这正是「听音难拼写」的重灾区。", "her/bird/turn 听起来一样，拼写要靠记！", ["her", "bird", "girl", "turn", "nurse"]],

  // ===== L6 软硬音 + 静音字母 =====
  ["L6-SOFT-C", 6, "软音 c → /s/", "c(e|i|y)", "c 在 e/i/y 前读 /s/（软音），其他情况读 /k/（硬音）。city 不是 /kiti/！", "c 遇到 e/i/y 变软：city /s/", ["city", "nice", "ice", "face"]],
  ["L6-SOFT-G", 6, "软音 g → /dʒ/", "g(e|i|y)", "g 在 e/i/y 前多读 /dʒ/（软音），否则读 /g/（硬音）。例外：get、girl、give 仍是硬音 /g/！", "gem /dʒem/，但 girl 是 /gɜːl/——例外要记牢", ["gem", "giant", "giraffe", "cage", "page"]],
  ["L6-KN", 6, "kn → /n/", "kn", "词首的 k 在 n 前完全静音，knife 读 /naɪf/，不读 /kn/！", "k 在 kn 组合里睡大觉：knee = /niː/", ["knee", "know", "knife"]],
  ["L6-WR", 6, "wr → /r/", "wr", "词首的 w 在 r 前静音，write 读 /raɪt/。", "w 在 wr 里不说话：write = /raɪt/", ["write", "wrong", "wrist"]],
  ["L6-MB", 6, "词尾 mb → /m/", "mb", "词尾的 b 在 m 后静音，climb 读 /klaɪm/。", "mb 结尾时 b 闭嘴：climb /klaɪm/", ["climb", "thumb", "lamb"]],

  // ===== L7 音节切分 =====
  ["L7-VCCV", 7, "VCCV 切分：两辅音之间切开", "VCCV", "元-辅-辅-元结构从两个辅音中间切开：rab·bit、bas·ket、let·ter。切开后的闭音节元音读短音。", "两个 consonant 中间是墙：rab|bit", ["rabbit", "basket", "letter"]],
  ["L7-VCV", 7, "VCV 切分：第一元音后切开", "VCV", "元-辅-元结构多在第一个元音后切开，前面形成开音节，元音读字母名：o·pen、ti·ger、ro·bot。", "open 先给 o 自由：/ˈəʊ.pən/", ["tiger", "open", "robot"]],
  ["L7-COMPOUND", 7, "复合词拆分", "compound", "复合词先拆成两个小单词再拼读：base+ball、class+room、bed+room。", "先拆再拼：football = foot + ball", ["baseball", "classroom", "bedroom", "football"]],
  ["L7-AFFIX", 7, "词缀剥离", "affix", "先把后缀 er/or/y 剥离出单词主体再拼读：teach·er、play·er、farm·er。", "剥掉 er 壳：teacher = teach + er", ["teacher", "player", "farmer"]],
  ["L7-SCHWA", 7, "弱读 Schwa /ə/", "schwa", "多音节词的非重读元音统统弱化成 /ə/（schwa）：banana 里三个 a 读音全不同 /bəˈnɑːnə/！这是听写漏音节的头号元凶。", "banana 的三个 a：/bə-nɑː-nə/，第一个和最后一个都是模糊的 /ə/", ["banana", "camera", "sofa", "pencil"]],
  ["L7-LE", 7, "辅音 + le → /əl/", "Cle", "词尾「辅音+le」读 /əl/：ap·ple、ta·ble、lit·tle。", "apple 的 ple 读 /pl/加模糊 /əl/", ["apple", "table", "little"]],

  // ===== L8 构词法 =====
  ["L8-ED-T", 8, "-ed 在清音后读 /t/", "ed", "动词过去式 -ed 有三种读法之一：清音（/p/ /k/ /ʃ/ /s/ 等）后读 /t/：jumped /dʒʌmpt/。", "jumped 的 ed 轻轻带过：/t/", ["jumped", "looked", "washed"]],
  ["L8-ED-D", 8, "-ed 在浊音后读 /d/", "ed", "浊音（元音、/l/ /n/ /b/ /g/ 等）后 -ed 读 /d/：played /pleɪd/。", "played 的 ed 读 /d/", ["played", "cleaned", "opened"]],
  ["L8-ED-ID", 8, "-ed 在 t/d 后读 /ɪd/", "ed", "t/d 后 -ed 读完整的 /ɪd/（多出一个音节）：wanted /ˈwɒntɪd/。", "wanted 要读出两个音节：want-ed", ["wanted", "visited"]],
  ["L8-PLURAL-S", 8, "-s 在清音后读 /s/", "s", "名词复数 -s 在清音后读 /s/：cats /kæts/。", "cats 的 s 是 /s/", ["cats", "books", "maps"]],
  ["L8-PLURAL-Z", 8, "-s 在浊音后读 /z/", "s", "浊音后 -s 读 /z/：dogs /dɒgz/、pens /penz/。s 拼写不变但读音变！", "dogs 读 /dɒgz/ 不是 /dɒgs/", ["dogs", "pens"]],
  ["L8-PLURAL-IZ", 8, "-es 读 /ɪz/", "es", "咝音（/s/ /ʃ/ /tʃ/ /x/）后加 -es 读 /ɪz/（多一个音节）：watches /ˈwɒtʃɪz/。", "watch→watches 多一个音节", ["watches", "boxes"]],
  ["L8-DOUBLE", 8, "双写辅音 + ing", "double", "「短元音+单辅音」结尾的动词加 ing 要双写辅音：run→running、swim→swimming、sit→sitting。漏写双写是最常见听写错误！", "run → runn+ing：短元音要双写护栏！", ["running", "swimming", "sitting"]],
  ["L8-DROP-E", 8, "去 e 加后缀", "drop-e", "魔法 e 结尾的动词加 ing 时要去掉 e：make→making、ride→riding、hope→hoping。", "e 让位给 ing：make→making", ["making", "riding", "hoping"]],
  ["L8-FLOSS", 8, "Floss 规则：f/l/s 双写", "ff|ll|ss", "短元音后的词尾 f/l/s 要双写：hill、miss、off、egg。", "短元音后 f/l/s 手拉手成双：hill、miss、off", ["hill", "miss", "off", "egg"]],
  ["L8-TCH", 8, "短元音后用 tch", "tch", "短元音后的 /tʃ/ 词尾写 tch：catch、watch、match。例外：rich、much、such。", "短元音后的 /tʃ/ 多个 t 护驾", ["catch", "watch", "match"]],
  ["L8-DGE", 8, "短元音后用 dge", "dge", "短元音后的 /dʒ/ 词尾写 dge：bridge、fridge、edge。", "短元音后的 /dʒ/ 写 dge", ["bridge", "fridge", "edge"]],
  ["L8-Y-AI", 8, "单音节词尾 y → /aɪ/", "y", "单音节词尾的 y 读 /aɪ/：my、fly、sky、try。y 在这里扮演 i 的长音角色。", "词尾 y 单音节读「爱」：my /maɪ/", ["my", "fly", "sky", "try"]],
  ["L8-Y-EE", 8, "多音节词尾 y → /ɪ/", "y", "多音节词尾的 y 读短音 /ɪ/：happy、baby、family、city。和单音节词尾不同！", "happy 的 y 短促：/ˈhæpɪ/", ["happy", "baby", "family", "city"]],
  ["L8-TION", 8, "-tion → /ʃən/", "tion", "tion 读 /ʃən/：station /ˈsteɪʃən/、nation。ti 手拉手读 /ʃ/。", "tion 是「sh恩」音：station", ["station", "nation"]],
];
