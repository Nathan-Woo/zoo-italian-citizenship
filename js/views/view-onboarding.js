import { el, mount, toast } from "../dom.js";
import { signInWithGoogle } from "../auth.js";
import { isUsernameTaken } from "../db.js";

export function renderSignIn(container) {
  async function handleClick(e) {
    e.target.disabled = true;
    e.target.textContent = "Opening Google sign-in…";
    try {
      await signInWithGoogle();
    } catch (err) {
      toast(err.message.replace("Firebase: ", ""), "error");
      e.target.disabled = false;
      e.target.textContent = "Sign in with Google";
    }
  }

  mount(container, el("div", { class: "auth-screen" }, [
    el("div", { class: "auth-screen__art" }),
    el("div", { class: "auth-card" }, [
      el("span", { class: "auth-eyebrow" }, "MOD. IT-CIT · ACCESSO"),
      el("h1", { class: "auth-title" }, "Zoo's Italian Citizenship"),
      el("p", { class: "auth-sub" }, "Sign in with the Google account that's been approved for this app."),
      el("button", {
        class: "btn btn--primary btn--block btn--google",
        type: "button",
        onclick: handleClick,
      }, [
        el("span", { class: "btn--google__icon" }, "G"),
        "Sign in with Google",
      ]),
    ]),
  ]));
}

/**
 * onChoose(role, username) — username is required and unique.
 * existingRole / existingUsername prefill things when setting up the
 * second profile for someone who already has one.
 */
export function renderRoleChoice(container, { onChoose, existingRole, existingUsername, uid }) {
  let checking = false;

  const usernameInput = el("input", {
    type: "text",
    maxlength: "24",
    placeholder: "e.g. NateB or Ari",
    value: existingUsername || "",
    required: true,
  });

  const usernameHint = el("p", { class: "muted small" }, existingRole
    ? "Reuse the same name, or pick a different one just for this role."
    : "This is how you'll show up on rosters and grading screens — pick something easy to recognize.");

  const studentBtn = el("button", {
    class: "role-pick__option role-pick__option--btn",
    type: "button",
    disabled: existingRole === "student",
  }, [
    el("div", {}, [
      el("strong", {}, "Studente"),
      el("small", {}, "Learn, take quizzes, earn points"),
    ]),
  ]);
  const masterBtn = el("button", {
    class: "role-pick__option role-pick__option--btn",
    type: "button",
    disabled: existingRole === "master",
  }, [
    el("div", {}, [
      el("strong", {}, "Maestro"),
      el("small", {}, "Build content, assign & grade quizzes"),
    ]),
  ]);

  async function attemptChoose(role) {
    const username = usernameInput.value.trim();
    if (!username) {
      usernameHint.textContent = "Enter a username first.";
      usernameHint.classList.add("field-error");
      usernameInput.focus();
      return;
    }
    if (checking) return;
    checking = true;
    try {
      // Skip the uniqueness check if this exactly matches the username
      // already on file for this same person's other role.
      if (username.toLowerCase() !== (existingUsername || "").toLowerCase()) {
        usernameHint.textContent = "Checking availability…";
        usernameHint.classList.remove("field-error");
        const taken = await isUsernameTaken(username, uid);
        if (taken) {
          usernameHint.textContent = "That username is already taken — try another.";
          usernameHint.classList.add("field-error");
          checking = false;
          return;
        }
      }
      await onChoose(role, username);
    } finally {
      checking = false;
    }
  }

  studentBtn.addEventListener("click", () => attemptChoose("student"));
  masterBtn.addEventListener("click", () => attemptChoose("master"));

  mount(container, el("div", { class: "auth-screen" }, [
    el("div", { class: "auth-screen__art" }),
    el("div", { class: "auth-card" }, [
      el("span", { class: "auth-eyebrow" }, "MOD. IT-CIT · PROFILO"),
      el("h1", { class: "auth-title" }, existingRole ? "Set up a second profile" : "Welcome"),
      el("p", { class: "auth-sub" }, existingRole
        ? `You already have a ${existingRole} account on this login. Set up the other role to test both sides — each keeps its own separate data.`
        : "Pick a username, then how you'll be using the app."),
      el("label", { class: "field" }, [
        el("span", {}, "Username"),
        usernameInput,
      ]),
      usernameHint,
      el("div", { class: "role-pick role-pick--stacked" }, [studentBtn, masterBtn]),
    ]),
  ]));
}
