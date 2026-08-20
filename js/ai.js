import { app } from "./firebase-init.js";
import {
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const functions = getFunctions(app);

/**
 * Calls the suggestContent Cloud Function (see /functions/index.js).
 * The Anthropic API key lives only on the server side — never in this
 * client code — so this just passes context and gets suggestions back.
 *
 * input: { focusType, packName, notes, count }
 * returns: [{ type, italian, english, hint }]
 */
export async function requestContentSuggestions(input) {
  const call = httpsCallable(functions, "suggestContent");
  const result = await call(input);
  return result.data.suggestions || [];
}
