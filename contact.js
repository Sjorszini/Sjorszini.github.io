(function () {
  "use strict";

  // Kept out of the HTML so addresses are not exposed as visible page content.
  // After FormSubmit activation, these can be replaced by FormSubmit's opaque
  // endpoint tokens for stronger address hiding.
  var destinations = {
    academic: "cy5qLmhlZWZlckB0dWUubmw=",
    teaching: "cy5qLmhlZWZlckB0dWUubmw=",
    music: "c2pvcnNoZWVmZXJAbGl2ZS5ubA==",
    other: "cy5qLmhlZWZlckB0dWUubmw="
  };

  function decode(value) {
    try {
      return atob(value);
    } catch (error) {
      return "";
    }
  }

  function currentTopic() {
    var select = document.getElementById("contact-topic");
    return select && destinations[select.value] ? select.value : "academic";
  }

  function destinationAddress() {
    return decode(destinations[currentTopic()]);
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

    var destination = destinationAddress();
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
    } catch (error) {
      setStatus("The message could not be sent. Please try again later.", true);
    } finally {
      setBusy(false);
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    initialiseTopicFromQuery();

    var form = document.getElementById("contact-form");
    if (!form) return;

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      submitForm(form);
    });
  });
})();
