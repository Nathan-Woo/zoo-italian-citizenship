import { el, mount, toast } from "../dom.js";
import { signInWithGoogle } from "../auth.js";

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

export function renderRoleChoice(container, { onChoose, existingRole }) {
  mount(container, el("div", { class: "auth-screen" }, [
    el("div", { class: "auth-screen__art" }),
    el("div", { class: "auth-card" }, [
      el("span", { class: "auth-eyebrow" }, "MOD. IT-CIT · PROFILO"),
      el("h1", { class: "auth-title" }, existingRole ? "Set up a second profile" : "Welcome"),
      el("p", { class: "auth-sub" }, existingRole
        ? `You already have a ${existingRole} account on this login. Set up the other role to test both sides — each keeps its own separate data.`
        : "How will you be using the app?"),
      el("div", { class: "role-pick role-pick--stacked" }, [
        el("button", {
          class: "role-pick__option role-pick__option--btn",
          type: "button",
          disabled: existingRole === "student",
          onclick: () => onChoose("student"),
        }, [
          el("div", {}, [
            el("strong", {}, "Studente"),
            el("small", {}, "Learn, take quizzes, earn points"),
          ]),
        ]),
        el("button", {
          class: "role-pick__option role-pick__option--btn",
          type: "button",
          disabled: existingRole === "master",
          onclick: () => onChoose("master"),
        }, [
          el("div", {}, [
            el("strong", {}, "Maestro"),
            el("small", {}, "Build content, assign & grade quizzes"),
          ]),
        ]),
      ]),
    ]),
  ]));
}
