"""Edit mode: a part script read as a design, and one number of it changed by hand.

``service`` runs in the viewer's server and only starts processes and passes JSON; ``tracer`` is
the process that runs the part, with the CAD kernel. Nothing here is imported at module scope by
the viewer.
"""
