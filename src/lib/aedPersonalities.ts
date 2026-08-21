export interface AEDPersonality {
  emoji: string;
  name: string;
  catchphrase: string;
}

// 50 animals — enough to cover all stages without repeating
const PERSONALITIES: AEDPersonality[] = [
  { emoji: "🐼", name: "シロ",   catchphrase: "いつでもここにいるよ！" },
  { emoji: "🦊", name: "コン",   catchphrase: "すばしっこく助けに行くよ" },
  { emoji: "🐰", name: "モモ",   catchphrase: "ドキドキしてる？大丈夫！" },
  { emoji: "🐻", name: "ゴロ",   catchphrase: "どっしり構えて待ってるよ" },
  { emoji: "🦁", name: "カイ",   catchphrase: "いざとなれば頼ってね！" },
  { emoji: "🐨", name: "ソラ",   catchphrase: "のんびり待ってるからね" },
  { emoji: "🐮", name: "ベル",   catchphrase: "リンリン、いつでも呼んで" },
  { emoji: "🐸", name: "ケロ",   catchphrase: "ぴょんと飛んで助けるよ" },
  { emoji: "🐧", name: "コル",   catchphrase: "寒くても元気に待機中！" },
  { emoji: "🦆", name: "スケ",   catchphrase: "すいすい泳いで届けるよ" },
  { emoji: "🐱", name: "タマ",   catchphrase: "にゃんと！いざとなれば本気出す" },
  { emoji: "🐶", name: "ポチ",   catchphrase: "わんわん！まかせといて" },
  { emoji: "🐹", name: "モフ",   catchphrase: "ぷにぷにしてるけど頼れるよ" },
  { emoji: "🦝", name: "リク",   catchphrase: "手洗い得意、救助も得意" },
  { emoji: "🐺", name: "ゲン",   catchphrase: "群れで助ければ最強だ" },
  { emoji: "🦅", name: "タカ",   catchphrase: "高いところから見守ってるよ" },
  { emoji: "🦉", name: "ミミ",   catchphrase: "夜も昼もずっと見てるよ" },
  { emoji: "🐗", name: "ブー",   catchphrase: "まっすぐ突進して助けるぞ！" },
  { emoji: "🦌", name: "バンビ", catchphrase: "かけ足で駆けつけます" },
  { emoji: "🐓", name: "コケ",   catchphrase: "朝も晩も待機中" },
  { emoji: "🦋", name: "チョウ", catchphrase: "やさしく寄り添うよ" },
  { emoji: "🐙", name: "タコ",   catchphrase: "8本腕でサポートするよ！" },
  { emoji: "🦈", name: "サメ",   catchphrase: "速攻で助けに行くぜ" },
  { emoji: "🐬", name: "ルカ",   catchphrase: "一緒にがんばろう！" },
  { emoji: "🦜", name: "ピコ",   catchphrase: "使い方は教えるよ！" },
  { emoji: "🐦", name: "スズ",   catchphrase: "小さくても力になれるよ" },
  { emoji: "🦩", name: "フラ",   catchphrase: "エレガントに助けます" },
  { emoji: "🐝", name: "ハナ",   catchphrase: "みんなで助け合おう！" },
  { emoji: "🐠", name: "ニモ",   catchphrase: "どこにいても見つけてね" },
  { emoji: "🦔", name: "ハリ",   catchphrase: "とげとげしてるけど優しいよ" },
  { emoji: "🐘", name: "ゾウ",   catchphrase: "絶対に忘れないよ！" },
  { emoji: "🦒", name: "キリン", catchphrase: "遠くからでも見えてるよ" },
  { emoji: "🦓", name: "シマ",   catchphrase: "どんな道も走り抜けるよ" },
  { emoji: "🦏", name: "サイ",   catchphrase: "岩みたいに頼れるよ" },
  { emoji: "🐊", name: "ワニ",   catchphrase: "水中でも陸でも助けるよ" },
  { emoji: "🦛", name: "カバ",   catchphrase: "どっかり座って待ってるよ" },
  { emoji: "🐆", name: "チータ", catchphrase: "世界最速で駆けつける！" },
  { emoji: "🐅", name: "トラ",   catchphrase: "勇気を出して呼んでね" },
  { emoji: "🦧", name: "ゴリ",   catchphrase: "力持ちだから頼って！" },
  { emoji: "🦦", name: "カワウソ", catchphrase: "いつも笑顔で待ってるよ" },
  { emoji: "🐿️", name: "リス",  catchphrase: "ちょこまかと素早く動くよ" },
  { emoji: "🦚", name: "クジャク", catchphrase: "美しく、でも力強く" },
  { emoji: "🦢", name: "ハクチョウ", catchphrase: "白く輝いてわかりやすいよ" },
  { emoji: "🦤", name: "ドードー", catchphrase: "絶滅しないよ、ずっとここにいる" },
  { emoji: "🐡", name: "フグ",   catchphrase: "ふくらんで目立ってるよ" },
  { emoji: "🦭", name: "アザラシ", catchphrase: "海でも陸でも助けるよ" },
  { emoji: "🐪", name: "ラクダ", catchphrase: "砂漠でも走り抜けるよ" },
  { emoji: "🦙", name: "ラマ",   catchphrase: "ふわふわだけど頼れるよ" },
  { emoji: "🐃", name: "ウシ",   catchphrase: "じっくり着実に助けるよ" },
  { emoji: "🦡", name: "アナグマ", catchphrase: "地道に頑張ってるよ" },
];

// Deterministic assignment: same AED always gets the same animal
export function getPersonality(aedId: string, index?: number): AEDPersonality {
  if (index !== undefined) return PERSONALITIES[index % PERSONALITIES.length]!;
  let h = 0;
  for (const c of aedId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PERSONALITIES[h % PERSONALITIES.length]!;
}
