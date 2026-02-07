---
alwaysApply: true
---

Applying Filters

Applying filters is straightforward. You can assign a filter instance to the filters property of any scene object, such as Sprite, Container, or Graphics. You can apply multiple filters by passing an array of filter instances.

import { BlurFilter, NoiseFilter } from 'pixi.js';

sprite.filters = new BlurFilter({ strength: 5 });

sprite.filters = [new BlurFilter({ strength: 4 }), new NoiseFilter({ noise: 0.2 })];

info

Order matters — filters are applied in sequence.
Advanced Blend Modes

PixiJS v8 introduces advanced blend modes for filters, allowing for more complex compositing effects. These blend modes can be used to create unique visual styles and effects. To use advanced modes like HARD_LIGHT, you must manually import the advanced blend mode extension:

import 'pixi.js/advanced-blend-modes';
import { HardMixBlend } from 'pixi.js';

sprite.filters = [new HardMixBlend()];

Built-In Filters Overview

PixiJS v8 provides a variety of filters out of the box:
Filter Class	Description
AlphaFilter	Applies transparency to an object.
BlurFilter	Gaussian blur.
ColorMatrixFilter	Applies color transformations via a matrix.
DisplacementFilter	Distorts an object using another texture.
NoiseFilter	Adds random noise for a grainy effect.
info

To explore more community filters, see pixi-filters.

Blend Filters: Used for custom compositing modes
Filter Class	Description
ColorBurnBlend	Darkens the base color to reflect the blend color.
ColorDodgeBlend	Brightens the base color.
DarkenBlend	Retains the darkest color components.
DivideBlend	Divides the base color by the blend color.
HardMixBlend	High-contrast blend.
LinearBurnBlend	Darkens using linear formula.
LinearDodgeBlend	Lightens using linear formula.
LinearLightBlend	Combination of linear dodge and burn.
PinLightBlend	Selective replacement of colors.
SubtractBlend	Subtracts the blend color from base.