import log from 'utils/log';
import config from 'config/config';
import parser from 'config/options/template/parser';
import deIndent from 'virtualdom/items/Partial/deIndent';

export default function getPartialDescriptor ( ractive, name ) {
	var partial;

	// If the partial in instance or view heirarchy instances, great
	if ( partial = getPartialFromRegistry( ractive, name ) ) {
		return partial;
	}

	// Does it exist on the page as a script tag?
	partial = parser.fromId( name, { noThrow: true } );

	if ( partial ) {
		// is this necessary?
		partial = deIndent( partial );

		// parse and register to this ractive instance
		let parsed = parser.parse( partial, parser.getParseOptions( ractive ) );

		// register (and return main partial if there are others in the template)
		return ractive.partials[ name ] = config.template.processCompound( ractive, parsed );

	}

	log.error({
		debug: ractive.debug,
		message: 'noTemplateForPartial',
		args: { name: name }
	});

	// No match? Return an empty array
	return [];

}

function getPartialFromRegistry ( ractive, name ) {

	// find first instance in the view hierarchy that has this partial
	var instance = config.registries.partials.findInstance( ractive, name );

	if ( !instance ) { return; }

	let partial = instance.partials[ name ], fn;

	if ( typeof partial === 'function' ) {
		fn = partial;
		fn.isOwner = instance.partials.hasOwnProperty(name);
		partial = partial( instance.data );
	}
	// If this was added manually to the registry,
	// but hasn't been parsed, parse it now
	if ( !parser.isParsed( partial ) ) {

		// use the parseOptions of the ractive instance on which it was found
		partial = parser.parse( partial, parser.getParseOptions( instance ) );

		// if fn, use ractive to store result, otherwise needs to go on
		// instance in the correct point in prototype chain
		let target = fn ? instance : findOwner( instance, name );

		// may be a template with partials, which need to be registered and main template extracted
		target.partials[ name ] = partial = config.template.processCompound( target, partial );
	}
	if ( fn ) {
		partial._fn = fn;
	}
	return partial;

}

function findOwner ( instance, name ) {
	return ( instance.partials.hasOwnProperty( name ) )
		? instance : findParent( instance.constructor, name);
}

function findParent ( constructor, name ) {
	if ( !constructor ) { return; }
	return ( constructor.partials.hasOwnProperty( name ) )
		? constructor : findParent( constructor._parent, name);
}
