// Device profile: input mode and performance budget.
// Desktop keeps the original values; touch/mobile devices get a lighter budget.
// `?touch=1` forces touch mode (useful for testing on desktop).

const params = new URLSearchParams(location.search);

export const TOUCH = params.get('touch') === '1' || (params.get('touch') !== '0' && window.matchMedia('(pointer: coarse)').matches);

// Touch-first devices, or phone-sized screens, are treated as mobile-class GPUs.
// (Kept strict so small laptop displays such as 1280×800 keep the desktop budget.)
const SMALL = Math.min(screen.width, screen.height) < 500;
export const MOBILE = TOUCH || SMALL;

export const PERF = MOBILE
  ? {
      maxPixelRatio: 1.5,
      minPixelRatio: 1,
      adaptive: true, // step pixel ratio down if frames are slow
      textPxPerUnit: 180,
      textMaxPx: 768,
      maxActiveText: 22,
      textActivationsPerTick: 3,
      anisotropy: 4,
      imageConcurrency: 3,
      focusEvery: 2, // centre-focus raycast every n frames
    }
  : {
      maxPixelRatio: 2,
      minPixelRatio: 2,
      adaptive: false,
      textPxPerUnit: 230,
      textMaxPx: 1024,
      maxActiveText: 44,
      textActivationsPerTick: 5,
      anisotropy: 8,
      imageConcurrency: 4,
      focusEvery: 1,
    };
