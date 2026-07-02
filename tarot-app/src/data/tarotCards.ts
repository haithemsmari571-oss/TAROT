import type { ImageSourcePropType } from "react-native";

export interface TarotCard {
  id: number; // 0–21, Major Arcana order
  name: string;
  image: ImageSourcePropType;
  keywords: [string, string, string];
  light: string; // 2-sentence upright meaning
  shadow: string; // 1-sentence shadow side
}

// Major Arcana (0–21). Images live in tarot-app/assets/tarot/.
export const TAROT_CARDS: TarotCard[] = [
  {
    id: 0,
    name: "The Fool",
    image: require("../../assets/tarot/00_the_fool.png"),
    keywords: ["Beginnings", "Innocence", "Leap"],
    light:
      "A new journey opens before you, unwritten and full of promise. Trust the pull toward the unknown — this is where your story begins.",
    shadow:
      "Reckless, blind steps can carry you over the edge before you're ready.",
  },
  {
    id: 1,
    name: "The Magician",
    image: require("../../assets/tarot/01_the_magician.png"),
    keywords: ["Power", "Will", "Creation"],
    light:
      "Everything you need is already in your hands. Focus your will and the world bends to meet your intention.",
    shadow: "That same power, misused, becomes manipulation and empty illusion.",
  },
  {
    id: 2,
    name: "The High Priestess",
    image: require("../../assets/tarot/02_the_high_priestess.png"),
    keywords: ["Intuition", "Mystery", "Secrets"],
    light:
      "A quiet knowing stirs beneath your thoughts. Listen inward — the answer is already whispering to you.",
    shadow: "Secrets kept too long curdle into confusion and self-doubt.",
  },
  {
    id: 3,
    name: "The Empress",
    image: require("../../assets/tarot/03_the_empress.png"),
    keywords: ["Abundance", "Nurture", "Growth"],
    light:
      "Life is ripening around you in love, comfort, and creativity. Let yourself receive what is quietly growing.",
    shadow:
      "Smothering or overindulgence can choke the very thing you're trying to nurture.",
  },
  {
    id: 4,
    name: "The Emperor",
    image: require("../../assets/tarot/04_the_emperor.png"),
    keywords: ["Structure", "Authority", "Stability"],
    light:
      "Stability comes through order and steady leadership. Build the framework that will hold your ambitions.",
    shadow: "Rigidity and control turn protection into a cage.",
  },
  {
    id: 5,
    name: "The Hierophant",
    image: require("../../assets/tarot/05_the_hierophant.png"),
    keywords: ["Tradition", "Guidance", "Belief"],
    light:
      "Wisdom passed down offers a path worth honoring. Seek the teacher, the ritual, the tried-and-true.",
    shadow:
      "Blind conformity can trap you in beliefs that no longer serve you.",
  },
  {
    id: 6,
    name: "The Lovers",
    image: require("../../assets/tarot/06_the_lovers.png"),
    keywords: ["Union", "Choice", "Values"],
    light:
      "A meaningful connection asks for your whole heart. This is a choice about who you are, not only who you love.",
    shadow:
      "Avoiding the decision only deepens the tension pulling you in two.",
  },
  {
    id: 7,
    name: "The Chariot",
    image: require("../../assets/tarot/07_the_chariot.png"),
    keywords: ["Drive", "Victory", "Willpower"],
    light:
      "Momentum is on your side when you steer with focus. Harness the opposing forces and press forward to win.",
    shadow:
      "Unchecked, that drive can careen out of control and leave wreckage behind.",
  },
  {
    id: 8,
    name: "Strength",
    image: require("../../assets/tarot/08_strength.png"),
    keywords: ["Courage", "Patience", "Grace"],
    light:
      "True power is gentle, patient, and unafraid. Tame what frightens you with compassion rather than force.",
    shadow:
      "Self-doubt can make you surrender your strength before the test even begins.",
  },
  {
    id: 9,
    name: "The Hermit",
    image: require("../../assets/tarot/09_the_hermit.png"),
    keywords: ["Solitude", "Reflection", "Wisdom"],
    light:
      "A season of quiet reveals what the noise has been hiding. Withdraw, and let your inner lamp light the way.",
    shadow: "Isolation held too tightly becomes loneliness that dims your light.",
  },
  {
    id: 10,
    name: "Wheel of Fortune",
    image: require("../../assets/tarot/10_wheel_of_fortune.png"),
    keywords: ["Cycles", "Fate", "Change"],
    light:
      "The wheel turns and fortune shifts in your favor. Ride the change instead of resisting its pull.",
    shadow:
      "Cling to a passing moment and the same wheel will carry it away.",
  },
  {
    id: 11,
    name: "Justice",
    image: require("../../assets/tarot/11_justice.png"),
    keywords: ["Truth", "Balance", "Consequence"],
    light:
      "Cause and consequence come into alignment now. Act with honesty and the scales will settle in your favor.",
    shadow: "Truths avoided have a way of returning to be answered.",
  },
  {
    id: 12,
    name: "The Hanged Man",
    image: require("../../assets/tarot/12_the_hanged_man.png"),
    keywords: ["Surrender", "Perspective", "Pause"],
    light:
      "A pause you didn't choose is offering a new angle. Release your grip and see what turning upside down reveals.",
    shadow:
      "Stubborn resistance only prolongs the very limbo you long to escape.",
  },
  {
    id: 13,
    name: "Death",
    image: require("../../assets/tarot/13_death.png"),
    keywords: ["Endings", "Transformation", "Release"],
    light:
      "Something must end so something truer can rise. Let the old fall away without fear — this is renewal, not ruin.",
    shadow: "Refusing the ending keeps you tethered to what is already gone.",
  },
  {
    id: 14,
    name: "Temperance",
    image: require("../../assets/tarot/14_temperance.png"),
    keywords: ["Balance", "Patience", "Harmony"],
    light:
      "Blend the extremes and a calmer path appears. Patience and moderation are quietly working in your favor.",
    shadow: "Impatience or excess can spill what you've carefully balanced.",
  },
  {
    id: 15,
    name: "The Devil",
    image: require("../../assets/tarot/15_the_devil.png"),
    keywords: ["Bondage", "Desire", "Shadow"],
    light:
      "A pattern binds you tighter than you admit. Naming the chain is the first step toward slipping free.",
    shadow: "Pretend the chains aren't there and they only grow heavier.",
  },
  {
    id: 16,
    name: "The Tower",
    image: require("../../assets/tarot/16_the_tower.png"),
    keywords: ["Upheaval", "Revelation", "Release"],
    light:
      "A sudden shift clears what was built on illusion. What falls now was never meant to hold you.",
    shadow:
      "Clinging to the crumbling structure only guarantees a harder fall.",
  },
  {
    id: 17,
    name: "The Star",
    image: require("../../assets/tarot/17_the_star.png"),
    keywords: ["Hope", "Healing", "Renewal"],
    light:
      "After the storm, a soft light returns to guide you. Let hope refill what was emptied.",
    shadow: "Doubt can blind you to the very hope shining right above you.",
  },
  {
    id: 18,
    name: "The Moon",
    image: require("../../assets/tarot/18_the_moon.png"),
    keywords: ["Illusion", "Fear", "Intuition"],
    light:
      "Not everything is as it appears in this dim light. Trust your instincts to navigate what the eyes can't confirm.",
    shadow:
      "Fear left unexamined turns harmless shadows into monsters that aren't there.",
  },
  {
    id: 19,
    name: "The Sun",
    image: require("../../assets/tarot/19_the_sun.png"),
    keywords: ["Joy", "Success", "Vitality"],
    light:
      "Warmth and clarity break through at last. Step into the light — this is a moment made for you.",
    shadow: "Even bright days can blind you to what still needs tending.",
  },
  {
    id: 20,
    name: "Judgement",
    image: require("../../assets/tarot/20_judgement.png"),
    keywords: ["Awakening", "Reckoning", "Renewal"],
    light:
      "A call rises that you can no longer ignore. Answer it honestly and step into who you're becoming.",
    shadow:
      "Harsh self-judgment can silence the very awakening trying to reach you.",
  },
  {
    id: 21,
    name: "The World",
    image: require("../../assets/tarot/21_the_world.png"),
    keywords: ["Completion", "Wholeness", "Arrival"],
    light:
      "A great cycle closes and you stand fulfilled. Honor how far you've come before the next journey calls.",
    shadow:
      "Refusing to close the chapter leaves you circling a finish line you've already crossed.",
  },
];
