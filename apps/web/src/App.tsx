import { Chat } from "./components/Chat";
import { MarkdownTest } from "./components/MarkdownTest";

function App() {
  // Show test via ?test query parameter
  const params = new URLSearchParams(window.location.search);
  const showTest = params.has("test");

  return showTest ? <MarkdownTest /> : <Chat />;
}

export default App;
