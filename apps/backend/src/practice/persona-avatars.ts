import type { Options } from "@dicebear/lorelei";

// Art direction for fictional characters, selected from rendered Lorelei parts.
// Each hairstyle is used once so the cast stays recognizable in small portraits.
// Nose and head choices add visual variety; they do not encode personality.
// Each character has a fixed palette so regeneration preserves their appearance.
export const personaAvatars: Record<
  string,
  {
    direction: string;
    features: Options & { hairColor: [string]; skinColor: [string] };
  }
> = {
  maya: {
    direction:
      "Curly bob, bright eyes, freckles, and an open smile for a warm creative.",
    features: {
      hair: ["variant18"],
      hairColor: ["694336"],
      skinColor: ["e7b99b"],
      head: ["variant02"],
      eyes: ["variant24"],
      eyebrows: ["variant07"],
      nose: ["variant03"],
      mouth: ["happy05"],
      frecklesProbability: 100,
      earrings: ["variant02"],
      earringsProbability: 100,
    },
  },
  leo: {
    direction:
      "Tousled short hair, a raised brow, and a playful smile for the outgoing photographer.",
    features: {
      hair: ["variant04"],
      hairColor: ["a3673c"],
      skinColor: ["f4cdb4"],
      head: ["variant01"],
      eyes: ["variant17"],
      eyebrows: ["variant11"],
      nose: ["variant04"],
      mouth: ["happy05"],
      earrings: ["variant01"],
      earringsProbability: 100,
    },
  },
  sam: {
    direction:
      "Neat side part, rectangular glasses, and a restrained smile for a quiet, thoughtful presence.",
    features: {
      hair: ["variant01"],
      hairColor: ["60646b"],
      skinColor: ["cc9973"],
      head: ["variant03"],
      eyes: ["variant08"],
      eyebrows: ["variant12"],
      nose: ["variant01"],
      mouth: ["happy02"],
      glasses: ["variant04"],
      glassesProbability: 100,
    },
  },
  zoe: {
    direction:
      "High ponytail, lively eyes, and a broad grin for an upbeat concert and dance enthusiast.",
    features: {
      hair: ["variant33"],
      hairColor: ["a56a43"],
      skinColor: ["f1c6ad"],
      head: ["variant04"],
      eyes: ["variant14"],
      eyebrows: ["variant09"],
      nose: ["variant06"],
      mouth: ["happy16"],
      earrings: ["variant03"],
      earringsProbability: 100,
    },
  },
  lily: {
    direction:
      "Twin buns, wide curious eyes, and freckles for a youthful illustration enthusiast.",
    features: {
      hair: ["variant26"],
      hairColor: ["393246"],
      skinColor: ["f3ceb1"],
      head: ["variant02"],
      eyes: ["variant09"],
      eyebrows: ["variant05"],
      nose: ["variant02"],
      mouth: ["happy08"],
      frecklesProbability: 100,
    },
  },
  nora: {
    direction:
      "Clean center-parted bob, slim glasses, and an attentive smile for a composed design enthusiast.",
    features: {
      hair: ["variant15"],
      hairColor: ["3f302b"],
      skinColor: ["e3b594"],
      head: ["variant04"],
      eyes: ["variant11"],
      eyebrows: ["variant07"],
      nose: ["variant05"],
      mouth: ["happy02"],
      glasses: ["variant03"],
      glassesProbability: 100,
    },
  },
  chloe: {
    direction:
      "Loose shoulder-length waves and a friendly open smile for a welcoming community regular.",
    features: {
      hair: ["variant35"],
      hairColor: ["b77a46"],
      eyebrowsColor: ["825237"],
      skinColor: ["f2c4a5"],
      head: ["variant01"],
      eyes: ["variant06"],
      eyebrows: ["variant09"],
      nose: ["variant03"],
      mouth: ["happy06"],
      earrings: ["variant03"],
      earringsProbability: 100,
    },
  },
  amara: {
    direction:
      "Full rounded curls, soft eyes, and a gentle smile for a warm, encouraging listener.",
    features: {
      hair: ["variant24"],
      hairColor: ["302621"],
      skinColor: ["b87e5c"],
      head: ["variant02"],
      eyes: ["variant10"],
      eyebrows: ["variant07"],
      nose: ["variant04"],
      mouth: ["happy01"],
      earrings: ["variant02"],
      earringsProbability: 100,
    },
  },
  dani: {
    direction:
      "A compact topknot with bangs, freckles, and a lively smile for spontaneous weekends.",
    features: {
      hair: ["variant14"],
      hairColor: ["97563e"],
      skinColor: ["dda785"],
      head: ["variant03"],
      eyes: ["variant20"],
      eyebrows: ["variant10"],
      nose: ["variant06"],
      mouth: ["happy05"],
      frecklesProbability: 100,
      earrings: ["variant01"],
      earringsProbability: 100,
    },
  },
  elena: {
    direction:
      "A smooth low bun, arched brows, and a poised smile for a confident, sophisticated presence.",
    features: {
      hair: ["variant32"],
      hairColor: ["50372f"],
      skinColor: ["d3a381"],
      head: ["variant04"],
      eyes: ["variant08"],
      eyebrows: ["variant12"],
      nose: ["variant01"],
      mouth: ["happy04"],
      earrings: ["variant03"],
      earringsProbability: 100,
    },
  },
  lucy: {
    direction:
      "A shaggy bob with bangs, round glasses, and an easy smile for a cozy bookshop regular.",
    features: {
      hair: ["variant23"],
      hairColor: ["c28151"],
      eyebrowsColor: ["955837"],
      skinColor: ["f4d2b9"],
      head: ["variant01"],
      eyes: ["variant24"],
      eyebrows: ["variant02"],
      nose: ["variant02"],
      mouth: ["happy01"],
      glasses: ["variant01"],
      glassesProbability: 100,
    },
  },
  aisha: {
    direction:
      "A high bun with a sweeping fringe and a welcoming smile for the generous dinner host.",
    features: {
      hair: ["variant45"],
      hairColor: ["2e2927"],
      skinColor: ["bb835d"],
      head: ["variant02"],
      eyes: ["variant04"],
      eyebrows: ["variant09"],
      nose: ["variant05"],
      mouth: ["happy05"],
      earrings: ["variant02"],
      earringsProbability: 100,
    },
  },
  grace: {
    direction:
      "A choppy asymmetric bob, freckles, and a small smile for an easygoing pottery enthusiast.",
    features: {
      hair: ["variant21"],
      hairColor: ["7b5144"],
      skinColor: ["ddb092"],
      head: ["variant02"],
      eyes: ["variant13"],
      eyebrows: ["variant05"],
      nose: ["variant06"],
      mouth: ["happy13"],
      frecklesProbability: 100,
      earrings: ["variant01"],
      earringsProbability: 100,
    },
  },
  vera: {
    direction:
      "An asymmetric bob, relaxed closed eyes, and a subtle smile for a quiet, reflective reader.",
    features: {
      hair: ["variant40"],
      hairColor: ["635b58"],
      skinColor: ["f0cbb5"],
      head: ["variant04"],
      eyes: ["variant19"],
      eyebrows: ["variant02"],
      nose: ["variant03"],
      mouth: ["happy02"],
    },
  },
  sofia: {
    direction:
      "A swept-up ponytail, expressive lashes, and a broad smile for a lively theater enthusiast.",
    features: {
      hair: ["variant31"],
      hairColor: ["986443"],
      skinColor: ["d39f7b"],
      head: ["variant01"],
      eyes: ["variant23"],
      eyebrows: ["variant11"],
      nose: ["variant04"],
      mouth: ["happy16"],
      earrings: ["variant03"],
      earringsProbability: 100,
    },
  },
  owen: {
    direction:
      "A short mullet, curious eyes, and an easy half-smile for a casual local explorer.",
    features: {
      hair: ["variant10"],
      hairColor: ["b79664"],
      eyebrowsColor: ["7c6041"],
      skinColor: ["ebc4a5"],
      head: ["variant02"],
      eyes: ["variant05"],
      eyebrows: ["variant10"],
      nose: ["variant05"],
      mouth: ["happy04"],
    },
  },
  ethan: {
    direction:
      "Spiked hair, strong brows, and a confident open smile for an energetic outdoors enthusiast.",
    features: {
      hair: ["variant27"],
      hairColor: ["8b5c3c"],
      skinColor: ["d9aa84"],
      head: ["variant03"],
      eyes: ["variant20"],
      eyebrows: ["variant03"],
      nose: ["variant04"],
      mouth: ["happy06"],
    },
  },
  isaac: {
    direction:
      "A sculpted quiff, attentive eyes, and a measured smile for a confident storyteller.",
    features: {
      hair: ["variant03"],
      hairColor: ["4e3d31"],
      skinColor: ["bf8a64"],
      head: ["variant03"],
      eyes: ["variant12"],
      eyebrows: ["variant07"],
      nose: ["variant01"],
      mouth: ["happy01"],
    },
  },
  julian: {
    direction:
      "Close-cropped hair, low-set glasses, and an inquisitive expression for a thoughtful adult presence.",
    features: {
      hair: ["variant28"],
      hairColor: ["6b6965"],
      skinColor: ["ddaf90"],
      head: ["variant04"],
      eyes: ["variant12"],
      eyebrows: ["variant03"],
      nose: ["variant05"],
      mouth: ["happy04"],
      glasses: ["variant05"],
      glassesProbability: 100,
    },
  },
  alex: {
    direction:
      "High, loose curls, bold brows, and a generous grin for an enthusiastic dinner host.",
    features: {
      hair: ["variant05"],
      hairColor: ["653f2b"],
      skinColor: ["c08b63"],
      head: ["variant02"],
      eyes: ["variant24"],
      eyebrows: ["variant08"],
      nose: ["variant06"],
      mouth: ["happy16"],
    },
  },
  adrian: {
    direction:
      "A tied topknot, angular beard, and relaxed eyes for an unhurried hands-on maker.",
    features: {
      hair: ["variant36"],
      hairColor: ["4c362c"],
      skinColor: ["dba57e"],
      head: ["variant01"],
      eyes: ["variant19"],
      eyebrows: ["variant02"],
      nose: ["variant01"],
      mouth: ["happy01"],
      beard: ["variant02"],
      beardProbability: 100,
    },
  },
  ryan: {
    direction:
      "A short wavy quiff, alert eyes, and a bright smile for an energetic tinkerer.",
    features: {
      hair: ["variant22"],
      hairColor: ["b56842"],
      skinColor: ["f1c8ad"],
      head: ["variant03"],
      eyes: ["variant14"],
      eyebrows: ["variant10"],
      nose: ["variant02"],
      mouth: ["happy05"],
    },
  },
  felix: {
    direction:
      "Cropped curls, a rounded full beard, and warm eyes for an approachable weekend traveler.",
    features: {
      hair: ["variant09"],
      hairColor: ["b18354"],
      eyebrowsColor: ["775637"],
      skinColor: ["e0b090"],
      head: ["variant01"],
      eyes: ["variant04"],
      eyebrows: ["variant07"],
      nose: ["variant03"],
      mouth: ["happy06"],
      beard: ["variant01"],
      beardProbability: 100,
    },
  },
  noah: {
    direction:
      "Upright tight curls, bright eyes, and an open grin for an optimistic runner.",
    features: {
      hair: ["variant39"],
      hairColor: ["3f3028"],
      skinColor: ["ac7756"],
      head: ["variant03"],
      eyes: ["variant16"],
      eyebrows: ["variant03"],
      nose: ["variant06"],
      mouth: ["happy05"],
    },
  },
  ben: {
    direction:
      "A layered shag, round glasses, and a relaxed smile for a friendly games-and-gigs regular.",
    features: {
      hair: ["variant17"],
      hairColor: ["c19a63"],
      eyebrowsColor: ["82613d"],
      skinColor: ["efc5a7"],
      head: ["variant02"],
      eyes: ["variant06"],
      eyebrows: ["variant08"],
      nose: ["variant04"],
      mouth: ["happy06"],
      glasses: ["variant01"],
      glassesProbability: 100,
    },
  },
  jamie: {
    direction:
      "A tousled curly mullet, a wink, and a playful grin for an energetic improv enthusiast.",
    features: {
      hair: ["variant20"],
      hairColor: ["754952"],
      skinColor: ["e1ab8c"],
      head: ["variant01"],
      eyes: ["variant15"],
      eyebrows: ["variant11"],
      nose: ["variant02"],
      mouth: ["happy07"],
      earrings: ["variant01"],
      earringsProbability: 100,
    },
  },
  arun: {
    direction:
      "A swept pompadour, slim glasses, and a gentle smile for a warm practical conversationalist.",
    features: {
      hair: ["variant08"],
      hairColor: ["312824"],
      skinColor: ["b9825e"],
      head: ["variant03"],
      eyes: ["variant05"],
      eyebrows: ["variant07"],
      nose: ["variant05"],
      mouth: ["happy04"],
      glasses: ["variant03"],
      glassesProbability: 100,
    },
  },
  marcus: {
    direction:
      "A receding hairline, rounded beard, and composed eyes for a mature, sophisticated presence.",
    features: {
      hair: ["variant25"],
      hairColor: ["626468"],
      skinColor: ["b08062"],
      head: ["variant04"],
      eyes: ["variant08"],
      eyebrows: ["variant12"],
      nose: ["variant01"],
      mouth: ["happy02"],
      beard: ["variant01"],
      beardProbability: 100,
    },
  },
  daniel: {
    direction:
      "Swept-back braids, open inquisitive eyes, and a soft smile for an attentive science enthusiast.",
    features: {
      hair: ["variant44"],
      hairColor: ["3b332e"],
      skinColor: ["c99673"],
      head: ["variant03"],
      eyes: ["variant02"],
      eyebrows: ["variant10"],
      nose: ["variant06"],
      mouth: ["happy01"],
    },
  },
  theo: {
    direction:
      "A short curtain fringe, round glasses, and a calm smile for a thoughtful coffee companion.",
    features: {
      hair: ["variant07"],
      hairColor: ["6c5c4d"],
      skinColor: ["edc3a4"],
      head: ["variant01"],
      eyes: ["variant08"],
      eyebrows: ["variant02"],
      nose: ["variant03"],
      mouth: ["happy02"],
      glasses: ["variant01"],
      glassesProbability: 100,
    },
  },
};
