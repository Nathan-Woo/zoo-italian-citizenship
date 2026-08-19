import { el, mount, toast } from "../dom.js";
import { signUp, logIn } from "../auth.js";

export function renderAuth(container) {
  let mode = "login"; // 'login' | 'signup'

  function draw() {
    const isSignup = mode === "signup";

    const form = el("form", { class: "auth-card", onsubmit: handleSubmit }, [
      el("div", { class: "auth-eyebrow" }, "MOD. IT-CIT · ACCESSO"),
      el("h1", { class: "auth-title" }, "Zoo's Italian Citizenship"),
      el("p", { class: "auth-sub" }, isSignup
        ? "Richiedi l'accesso — create your account."
        : "Bentornato — welcome back."),

      el("label", { class: "field" }, [
        el("span", {}, "Email"),
        el("input", { type: "email", name: "email", required: true, autocomplete: "email" }),
      ]),
      el("label", { class: "field" }, [
        el("span", {}, "Password"),
        el("input", {
          type: "password",
          name: "password",
          required: true,
          minlength: "6",
          autocomplete: isSignup ? "new-password" : "current-password",
        }),
      ]),

      isSignup &&
        el("label", { class: "field" }, [
          el("span", {}, "Display name"),
          el("input", { type: "text", name: "displayName", placeholder: "How you'll appear in the app" }),
        ]),

      isSignup &&
        el("div", { class: "field" }, [
          el("span", {}, "Account type"),
          el("div", { class: "role-pick" }, [
            el("label", { class: "role-pick__option" }, [
              el("input", { type: "radio", name: "role", value: "student", required: true }),
              el("div", {}, [
                el("strong", {}, "Studente"),
                el("small", {}, "Learn, take quizzes, earn points"),
              ]),
            ]),
            el("label", { class: "role-pick__option" }, [
              el("input", { type: "radio", name: "role", value: "master", required: true }),
              el("div", {}, [
                el("strong", {}, "Maestro"),
                el("small", {}, "Build content, assign & grade quizzes"),
              ]),
            ]),
          ]),
        ]),

      el("button", { class: "btn btn--primary btn--block", type: "submit" }, isSignup ? "Create account" : "Log in"),

      el("button", {
        class: "link-btn",
        type: "button",
        onclick: () => {
          mode = isSignup ? "login" : "signup";
          draw();
        },
      }, isSignup ? "Already have an account? Log in" : "New here? Create an account"),
    ]);

    async function handleSubmit(e) {
      e.preventDefault();
      const fd = new FormData(form);
      const submitBtn = form.querySelector("button[type=submit]");
      submitBtn.disabled = true;
      submitBtn.textContent = "One moment…";
      try {
        if (isSignup) {
          await signUp({
            email: fd.get("email"),
            password: fd.get("password"),
            displayName: fd.get("displayName"),
            role: fd.get("role"),
          });
          toast("Account created — welcome!", "success");
        } else {
          await logIn({ email: fd.get("email"), password: fd.get("password") });
        }
      } catch (err) {
        toast(err.message.replace("Firebase: ", ""), "error");
        submitBtn.disabled = false;
        submitBtn.textContent = isSignup ? "Create account" : "Log in";
      }
    }

    mount(container, el("div", { class: "auth-screen" }, [
      el("div", { class: "auth-screen__art" }),
      form,
    ]));
  }

  draw();
}
