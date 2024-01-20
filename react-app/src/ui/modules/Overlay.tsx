import { Actions } from "../containers/Actions";
import { Hand } from "../containers/Hand";
import { Header } from "../containers/Header";
import { Footer } from "../containers/Footer";

export const Overlay = () => {
  return (
    <div>
      <Header />
      <Actions />
      <Hand />
      <Footer />
    </div>
  );
};
