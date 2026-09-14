(function () {
  "use strict";

  // Opaque FormSubmit endpoint tokens. The actual destination email addresses
  // are no longer present in or reconstructed by the website code.
  var destinations = {
    academic: "7393c84eb6c87dd7567b1680cf4b095b",
    teaching: "7393c84eb6c87dd7567b1680cf4b095b",
    music: "1202e52dbad7f4f683257ad4e1241422",
    other: "7393c84eb6c87dd7567b1680cf4b095b"
  };

  function currentTopic() {
    var select = document.getElementById("contact-topic");
    return select && destinations[select.value] ? select.value : "academic";
  }

  function destinationEndpoint() {
    return destinations[currentTopic()] || "";
  }

  function setStatus(message, isError) {
    var status = document.getElementById("contact-status");
    if (!status) return;

    status.textContent = message;
    status.classList.toggle("is-error", Boolean(isError));
    status.classList.toggle("is-success", !isError && Boolean(message));
  }

  function setBusy(isBusy) {
    var button = document.getElementById("contact-submit");
    if (!button) return;

    button.disabled = isBusy;
    button.textContent = isBusy ? "Sending…" : "Send message";
  }

  function initialiseTopicFromQuery() {
    var select = document.getElementById("contact-topic");
    if (!select) return;

    var requested = new URLSearchParams(window.location.search).get("topic");
    if (requested && destinations[requested]) {
      select.value = requested;
    }
  }

  function showReturnStatus() {
    var params = new URLSearchParams(window.location.search);
    if (params.get("sent") === "1") {
      setStatus("Message sent. Thank you.", false);
    }
  }

  function formPayload() {
    var topicSelect = document.getElementById("contact-topic");
    var topicLabel = topicSelect.options[topicSelect.selectedIndex].text;
    var name = document.getElementById("contact-name").value.trim();
    var email = document.getElementById("contact-email").value.trim();
    var subjectInput = document.getElementById("contact-subject").value.trim();
    var message = document.getElementById("contact-message").value.trim();
    var honey = document.getElementById("contact-honey").value.trim();
    var subject = subjectInput || topicLabel + " enquiry via sjorsheefer.com";

    return {
      name: name,
      email: email,
      topic: topicLabel,
      subject: subjectInput,
      message: message,
      _subject: subject,
      _template: "table",
      _honey: honey,
      _url: window.location.href.split("?")[0]
    };
  }

  function setHidden(form, name, value) {
    var input = form.querySelector('input[type="hidden"][name="' + name + '"]');
    if (!input) {
      input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      form.appendChild(input);
    }
    input.value = value;
  }

  function nativeFallback(form, payload, destination) {
    setStatus("Sending securely…", false);
    setBusy(false);

    setHidden(form, "_subject", payload._subject);
    setHidden(form, "_template", payload._template);
    setHidden(form, "_url", payload._url);
    setHidden(
      form,
      "_next",
      window.location.origin + window.location.pathname + "?sent=1"
    );

    form.method = "POST";
    form.action = "https://formsubmit.co/" + destination;

    // Call the native form submit method directly so this submit handler does
    // not intercept the fallback request a second time.
    HTMLFormElement.prototype.submit.call(form);
  }

  async function submitForm(form) {
    if (!form.reportValidity()) return;

    var payload = formPayload();

    // Silently accept honeypot submissions so bots get no useful feedback.
    if (payload._honey) {
      form.reset();
      initialiseTopicFromQuery();
      setStatus("Message sent. Thank you.", false);
      return;
    }

    var destination = destinationEndpoint();
    if (!destination) {
      setStatus("The contact form is temporarily unavailable.", true);
      return;
    }

    setBusy(true);
    setStatus("Sending your message…", false);

    try {
      var response = await fetch("https://formsubmit.co/ajax/" + destination, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(payload)
      });

      var data = {};
      try {
        data = await response.json();
      } catch (error) {
        data = {};
      }

      if (!response.ok || data.success === false || data.success === "false") {
        throw new Error(data.message || "Submission failed");
      }

      form.reset();
      initialiseTopicFromQuery();
      setStatus("Message sent. Thank you.", false);
      setBusy(false);
    } catch (error) {
      // Cross-origin AJAX can be blocked by preview hosts or browser policy.
      // A normal HTTPS form POST is much more widely permitted, so use that
      // automatically instead of leaving the button apparently unresponsive.
      nativeFallback(form, payload, destination);
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    initialiseTopicFromQuery();
    showReturnStatus();

    var form = document.getElementById("contact-form");
    if (!form) return;

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      submitForm(form);
    });
  });
})();
