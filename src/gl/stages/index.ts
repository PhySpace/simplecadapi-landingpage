import { Stage } from '../Stage';
import { AssemblyStage } from './assembly';
import { ComposeStage } from './compose';
import { CodeStage, ParamsStage, SelectStage } from './flange';
import { SimStage } from './sim';
import { VerifyStage } from './verify';

/** The chapters' 3D stages. The hero is not one: its card shows the pre-rendered loops
 * (src/hero.ts); the live showcase stage is only used to capture them (src/capture.ts). */
export const pageStages = (): Stage[] => [
  new CodeStage(),
  new SelectStage(),
  new VerifyStage(),
  new ParamsStage(),
  new AssemblyStage(),
  new SimStage(),
  new ComposeStage(),
];
