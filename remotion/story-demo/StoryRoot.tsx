import { Composition } from "remotion";
import { PEOPLE_DURATION, PeopleDemo } from "./PeopleDemo";
import { STORY_DURATION, StoryDemo } from "./StoryDemo";

export const StoryRoot: React.FC = () => (
  <>
    <Composition id="BipStory" component={StoryDemo} durationInFrames={STORY_DURATION} fps={30} width={1080} height={1920} />
    <Composition id="PeopleStory" component={PeopleDemo} durationInFrames={PEOPLE_DURATION} fps={30} width={1080} height={1920} />
  </>
);
