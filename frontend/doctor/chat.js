document.addEventListener('DOMContentLoaded', function () {

    /* =========================================================
       PAGE DATA
       ========================================================= */

    var data = {};

    try {
        var el = document.getElementById('PAGE_DATA');

        data = el && el.textContent
            ? JSON.parse(el.textContent)
            : {};

    } catch (error) {

        console.error('Unable to read PAGE_DATA:', error);

        data = {};
    }


    var patientId = data.patientId;
    var doctorId = data.doctorId;

    var messagesEl = document.getElementById('messages');
    var form = document.getElementById('sendForm');
    var textEl = document.getElementById('msgText');


    /* =========================================================
       BASIC VALIDATION
       ========================================================= */

    if (
        !patientId ||
        !doctorId ||
        !messagesEl ||
        !form ||
        !textEl
    ) {
        console.error(
            'Doctor chat: required elements/data missing.'
        );

        return;
    }


    /* =========================================================
       TRACK DISPLAYED MESSAGE IDS
       Prevent duplicate messages.
       ========================================================= */

    var displayedMessageIds = new Set();


    /*
     * Read messages already rendered by EJS.
     *
     * We don't have to depend on their exact HTML structure.
     * This simply prevents duplicate socket messages when
     * possible.
     */
    messagesEl
        .querySelectorAll('.chat-msg')
        .forEach(function (element) {

            var messageId = element.getAttribute(
                'data-message-id'
            );

            if (messageId) {
                displayedMessageIds.add(
                    String(messageId)
                );
            }
        });


    /* =========================================================
       SOCKET.IO
       ========================================================= */

    var socket =
        typeof io === 'function'
            ? io()
            : null;


    if (!socket) {

        console.warn(
            'Socket.IO is not available. Live chat updates disabled.'
        );

    } else {

        /* ---------------------------------------------
           CONNECT
           --------------------------------------------- */

        socket.on('connect', function () {

            console.log(
                'Doctor chat socket connected:',
                socket.id
            );


            /*
             * Join the exact patient/doctor conversation.
             */
            socket.emit(
                'join-chat-thread',
                {
                    patientId: patientId,
                    doctorId: doctorId
                }
            );

        });


        /* ---------------------------------------------
           SOCKET ERROR
           --------------------------------------------- */

        socket.on('connect_error', function (error) {

            console.error(
                'Doctor chat socket connection error:',
                error
            );

        });


        /* ---------------------------------------------
           RECEIVE MESSAGE
           --------------------------------------------- */

        socket.on('chat-message', function (message) {

            if (!message) {
                return;
            }


            /*
             * Only add patient messages here.
             *
             * Doctor messages are already added from the
             * POST response in sendMessage().
             *
             * This prevents the doctor's own message from
             * appearing twice.
             */

            if (message.sender === 'patient') {

                appendMessage(message);

            }

        });

    }


    /* =========================================================
       APPEND MESSAGE
       ========================================================= */

    function appendMessage(m) {
  if (!m) return;

  var sender = m.sender || 'patient';
  var isDoctor = sender === 'doctor';

  var row = document.createElement('div');
  row.className =
    'doctor-chat-message ' +
    (isDoctor ? 'doctor' : 'patient');

  var avatar = document.createElement('div');
  avatar.className = 'doctor-chat-avatar';

  if (isDoctor) {
    avatar.innerHTML = '<i class="fas fa-user-md"></i>';
  } else {
    var patientName =
      data.patientName ||
      'P';

    avatar.textContent =
      patientName.charAt(0).toUpperCase();
  }

  var content = document.createElement('div');
  content.className = 'doctor-chat-message-content';

  var meta = document.createElement('div');
  meta.className = 'doctor-chat-message-meta';

  var name = document.createElement('strong');
  name.textContent = isDoctor
    ? 'You'
    : (data.patientName || 'Patient');

  var time = document.createElement('span');

  var timestamp =
    m.timestamp ||
    m.created_at ||
    new Date().toISOString();

  time.textContent =
    new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });

  meta.appendChild(name);
  meta.appendChild(time);

  var bubble = document.createElement('div');
  bubble.className = 'doctor-chat-bubble';
  bubble.textContent =
    m.text ||
    m.message ||
    '';

  content.appendChild(meta);
  content.appendChild(bubble);

  if (isDoctor) {
    row.appendChild(content);
    row.appendChild(avatar);
  } else {
    row.appendChild(avatar);
    row.appendChild(content);
  }

  messagesEl.appendChild(row);

  messagesEl.scrollTop =
    messagesEl.scrollHeight;
}


    /* =========================================================
       SCROLL
       ========================================================= */

    function scrollToBottom() {

        messagesEl.scrollTop =
            messagesEl.scrollHeight;

    }


    /* =========================================================
       SEND MESSAGE
       ========================================================= */

    form.addEventListener(
        'submit',
        async function (event) {

            event.preventDefault();


            var text =
                String(
                    textEl.value || ''
                ).trim();


            if (!text) {
                return;
            }


            var button =
                form.querySelector(
                    'button[type="submit"]'
                );


            var originalButtonHTML =
                button
                    ? button.innerHTML
                    : 'Send';


            /* -----------------------------------------
               Disable button while sending
               ----------------------------------------- */

            if (button) {

                button.disabled = true;

                button.innerHTML =
                    '<i class="fas fa-spinner fa-spin"></i> Sending...';

            }


            try {

                var response =
                    await fetch(
                        '/doctor/chats/' +
                        encodeURIComponent(patientId) +
                        '/message',
                        {
                            method: 'POST',

                            headers: {
                                'Content-Type':
                                    'application/json',

                                'Accept':
                                    'application/json'
                            },

                            body: JSON.stringify({
                                text: text
                            })
                        }
                    );


                /* -------------------------------------
                   Parse response safely
                   ------------------------------------- */

                var result = null;

                try {

                    result =
                        await response.json();

                } catch (jsonError) {

                    result = null;

                }


                /* -------------------------------------
                   HTTP error
                   ------------------------------------- */

                if (
                    !response.ok ||
                    !result ||
                    !result.success
                ) {

                    var errorMessage =
                        result &&
                        result.error
                            ? result.error
                            : 'Failed to send message.';

                    throw new Error(
                        errorMessage
                    );

                }


                /* -------------------------------------
                   Add saved database message
                   ------------------------------------- */

                if (result.message) {

                    appendMessage(
                        result.message
                    );

                }


                /* -------------------------------------
                   Clear input
                   ------------------------------------- */

                textEl.value = '';

                textEl.focus();


            } catch (error) {

                console.error(
                    'Doctor chat send error:',
                    error
                );


                alert(
                    error.message ||
                    'Unable to send message.'
                );


            } finally {

                /* -------------------------------------
                   Restore button
                   ------------------------------------- */

                if (button) {

                    button.disabled = false;

                    button.innerHTML =
                        originalButtonHTML;

                }

            }

        }
    );


    /* =========================================================
       ENTER TO SEND
       Shift + Enter = new line
       ========================================================= */

    textEl.addEventListener(
        'keydown',
        function (event) {

            if (
                event.key === 'Enter' &&
                !event.shiftKey
            ) {

                event.preventDefault();

                form.requestSubmit();

            }

        }
    );


    /* =========================================================
       INITIAL SCROLL
       ========================================================= */

    scrollToBottom();

});