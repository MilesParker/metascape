# Markets

A small market from the Eclipse Agent Modeling Platform (AMP) example model `Markets.metaabm` (project
`org.eclipse.amp.amf.examples.escape`). Firms offer their shares as instruments to traders. Each period
traders ask a price for an instrument they hold, and buy an asked instrument of a random firm they can
afford, which sets the firm's last price. Firms' earnings drift.

- Authors and citation: none. The model's description is empty, so none is given (none is invented).
- Copyright: the model has no copyright statement. The fallback "Copyright (c) Metascape LLC and others,
  made available under the Eclipse Public License" is used.
- Licence: EPL-2.0.

## Where the model comes from

The model is `Markets.metaabm`, translated into the model format
(`packages/spec/examples/escape/Markets.model.json`) and run by the format's interpreter.

A sale disconnects the seller, which removes all of the seller's links, as the generated code did
(`docs/metamodel-review.md`, Ambiguities). The model has no grid; its three networks are drawn, and the
charts show the gathered statistics: firm prices, firm earnings and trader funds. (Unsold asks are cleared at the end of each period, so a count of instruments asked is always 0 when it is collected.)
