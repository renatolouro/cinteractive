requirejs(["ui/ui", "ui/prettyprint", "interp/stepper", "ui/tooltips"], function(ui, prettyprint, stepper, tooltips) {
   var currLine = 0;
   var glState = {},
       glStepColl = [],
       curStep = 0,
       play_i,
       pause = false,
       glDone = false;

   // First create the global CodeMirror object, set up any options
   var CM = CodeMirror.fromTextArea(document.getElementById("code"), {
      indentUnit: 3,
      smartIndent: true,
      tabSize: 3,
      lineWrapping: true,
      lineNumbers: true,
      theme: 'neat',
      autoCloseBrackets: true
   });
   CM.addKeyMap({
      'Shift-Ctrl-f': function(cm) {
         nextStep();
      }
   });

   // receiveAST receives the JSON AST and compiles it into an initial state
   var receiveAST = function(data) {
      glStepColl = [];
      var initial_state = {};

      $('#ast').html(prettyprint.ipprint(data));

      initial_state = stepper.compile(data);

      var st = {
         stack:    _.cloneDeep(initial_state.stack)
       , heap:     _.cloneDeep(initial_state.heap)
       , frames:     _.cloneDeep(initial_state.frames)
       , user_types: _.cloneDeep(initial_state.user_types)
       , heapinfo: _.cloneDeep(initial_state.heapinfo)
       , kont:     _.cloneDeep(initial_state.kont) };

      // glStepColl is the collection of "steps" or "states" as the interpreter runs through the program.
      _(glStepColl).push(st);

      play_i = 0;

      return initial_state;
   };

   // Performs a step in the interpreter
   var doStep = function(state) {
      if (glDone) { return state; }

      console.log("Stepping " + curStep);
      console.log(_.cloneDeep(state));
      curStep += 1;

      // change the slider to the right step
      $('#stepper').val(curStep);

      // dump :: [[Statements]]
      //
      // The dump is the instruction stack essentially, or realistically what is left to be performed.
      // Any time a function is called its list of statements are pushed onto the dump.
      //
      // If it's empty then there better be something pointed to by the control
      // otherwise it's got to be done.
      if (_.isEmpty(state.dump)) {
         if (!_.isUndefined(state.control)) {
            console.log("Dump is empty, use state.control");
         }
         else {
            $('#whatsgoingon').html('Done!');
            glDone = true;
            return state;
         }
      } 
      else {
         // If the dump is not empty, but there's an empty list then we've just returned, so pop
         // that empty list off.
         if (!state.dump.isEmpty() && _(state.dump).last().length === 0) {
            _(state.dump).pop();
         }

         // If it's completely empty we're done
         if (state.dump.isEmpty()) {
            $('#whatsgoingon').html('Done!');
            glDone = true;
            return state;
         }

         // The next instruction in the dump; this is the first element of the last list.
         state.control = _(state.dump).last().shift();
      }

      // Set up the current instruction for stepping
      state = stepper.step[state.control["node"]](state);
      var st = {
         stack:      _.cloneDeep(state.stack)
       , heap:       _.cloneDeep(state.heap)
       , frames:     _.cloneDeep(state.frames)
       , user_types: _.cloneDeep(state.user_types)
       , heapinfo:   _.cloneDeep(state.heapinfo)
       , kont:       _.cloneDeep(state.kont) };

      // Push the intermediate step into the collection.
      _(glStepColl).push(st);

      return state;
   };

   // collectSteps will take the first state and do a run-through of the program to collect all the steps,
   // then set up the slider and some event bindings.
   var collectSteps = function(state) {
      glDone = false;

      while (!glDone) {
         var state = doStep(state);
      }

      $('#stepper').prop('min', 0);
      $('#stepper').prop('max', glStepColl.length - 1);
      $('#stepper').val(0);
      $('#stepper').change(function(e) {
         curStep = $(e.currentTarget).val();
         ui.uiStep(glStepColl[$(e.currentTarget).val()]);
      });

       return glStepColl;
   };

   // autoPlay steps through the program with a 1-sec delay. It calls itself.
   var autoPlay = function() {
      // If we've reached the end of the program, re-set everything.
      if (play_i === _(glStepColl).size()) {
         play_i = 0;
         ui.uiStep(glStepColl[play_i]);
      } 
      // If we haven't paused increase a step and set a timeout
      else if (!pause) {
         pause = false;
         var stepnum = _(glStepColl).size();
         ui.uiStep(glStepColl[play_i]);
         play_i += 1;
         setTimeout(autoPlay, 1000);
      }
      // otherwise if we have paused don't set a timeout again please.
      else if (pause) {
         pause = true;
      }
   };


   var uiBindings = function() {
      // CodeMirror options
      $('#autoclose').change(function(e){ CM.setOption('autoCloseBrackets', $(e.currentTarget).prop('checked')) });
      $('.opts_menu').toggle();
      $('#options').click(function() {$('.opts_menu').animate({height: 'toggle'});});
      $('#code').focus();

      $('#state').click(function() {
         console.log(glState);
      });
      $('#give').click(function(){ a = glState; });
      $('#scoll').click(function(){ console.log(glStepColl); });
      $('#step').click(function(){ 
         glState = doStep(glState); 
         ui.uiStep(glState);
      });

      $('.autoplay').click(function() { pause = false; autoPlay(); });
      $('.undo-a-step').click(function() { if (play_i < _(glStepColl).size()) { play_i -= 1; ui.uiStep(glStepColl[play_i]); } });
      $('.do-a-step').click(function() { if (play_i < _(glStepColl).size()) { ui.uiStep(glStepColl[play_i]); play_i += 1; } });
      $('.stop').click(function() { play_i = _(glStepColl).size(); });
      $('.pause').click(function() { pause = true; });

      $("#compile").click(function() {
         $('#functions').empty();
         $('.alert').hide();
         $('.collected a').text('Data Received, Click to Collect Steps');
         $('.collected a').one('click', function() {
            glStepColl = collectSteps(glState, glStepColl);
            glState = glStepColl[0];

            $('.collected a').html('Steps compiled');
         });

         $('#source').empty();

         $.post('http://localhost:3000/parse', CM.getValue())
         .success(function(data) {
            var rstate = receiveAST(data);
            var state    = rstate;

            glState = state;
            ui.uiStep(state);

            curStep = 0;

            var newstack = [{}];
            glState.stack = newstack.concat(glState.stack);
            glState.frames.unshift({name: 'main', params: state.heapinfo[_(state.stack).last()["main"]].params});
         })
         .error(function(err) {
            $('.alert').html(err);
            $('.alert').toggle();
         });
         return false;
      });

      tooltips.enableTooltips();
      tooltips.tooltipBindings();
   };

   // Close the ui over the CodeMirror object
   //  and bind event handlers for clicky things
   ui = ui(CM);
   uiBindings();

   // Attach invocation to dom because we're going to be removing and stuff a lot?
   $(document).on('state_update', '#frames li', prettyprint.update);
   $(document).on('click', '.compound_key', function(e) {
      var key = $(e.currentTarget);
      var name = key.data('compound');
      $('[data-var="' + name + '"]').toggle();
   });
});
